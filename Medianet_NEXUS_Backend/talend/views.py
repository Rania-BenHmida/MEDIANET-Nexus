"""
Talend refresh — manual trigger (this page's button) and scheduled trigger
(talend/scheduler.py, every 2 days) both go through run_talend_job() below,
so there's exactly one code path that starts the job, tracks in-flight
status for polling, and writes the outcome to EtlRunLog.

Runs the exported Data_Master_run.bat as a background subprocess (so the
HTTP request that starts it returns immediately) and tracks status in a
module-level dict, keyed by job_id, for polling an in-flight run.

Separately, the outcome of every run (success or failed) is written to a
small JSON file on disk (settings.TALEND_LAST_RUN_FILE) — kept as a legacy
fallback for last_run() in case EtlRunLog is ever unreachable — and to the
EtlRunLog table, which is what the history list reads.
"""
import json
import subprocess
import threading
import uuid
from datetime import datetime, timezone

from django.conf import settings
from django.http import JsonResponse

from .models import EtlRunLog

# job_id -> {status, returncode, output, started_at, finished_at}
_jobs: dict[str, dict] = {}
_lock = threading.Lock()

# Only one Data_Master run at a time — prevents two overlapping upserts
# against the same warehouse tables. Shared between manual and scheduled
# triggers, so a scheduled run won't stomp on one someone just started
# by hand (and vice versa).
_current_job_id: str | None = None


def _write_last_run(job: dict):
    try:
        settings.TALEND_LAST_RUN_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(settings.TALEND_LAST_RUN_FILE, "w") as f:
            json.dump(job, f)
    except OSError:
        pass


def _write_log_row(job_id: str, **fields):
    """Best-effort EtlRunLog write — never lets a logging failure break the actual job."""
    try:
        EtlRunLog.objects.filter(job_id=job_id).update(**fields)
    except Exception:
        pass


def _notify_result(status: str, returncode: int | None, output: str):
    try:
        from surveys.services import notify
        if status == "success":
            notify(
                event_type="talend_refresh_success",
                title="Talend refresh completed",
                body="Data_Master finished successfully — the data warehouse is up to date.",
                related_type="talend_job",
            )
        else:
            notify(
                event_type="talend_refresh_failed",
                title="Talend refresh failed",
                body=(output or "")[:300],
                related_type="talend_job",
            )
    except Exception:
        pass


def _run_job(job_id: str, bat_path: str, cwd: str):
    global _current_job_id
    try:
        result = subprocess.run(
            ["cmd", "/c", bat_path],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=1800,
        )
        with _lock:
            status = "success" if result.returncode == 0 else "failed"
            output = (result.stdout or "")[-4000:] + (result.stderr or "")[-4000:]
            _jobs[job_id].update(
                status=status,
                returncode=result.returncode,
                output=output,
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
            _write_last_run(_jobs[job_id])
            _write_log_row(
                job_id, status=status, returncode=result.returncode,
                output=output, finished_at=datetime.now(timezone.utc),
            )
        _notify_result(status, result.returncode, output)
    except subprocess.TimeoutExpired as e:
        output = f"Job timed out after {e.timeout}s.\n" + (e.output or "")
        with _lock:
            _jobs[job_id].update(
                status="failed", returncode=None, output=output,
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
            _write_last_run(_jobs[job_id])
            _write_log_row(job_id, status="failed", returncode=None, output=output, finished_at=datetime.now(timezone.utc))
        _notify_result("failed", None, output)
    except Exception as e:
        output = f"Failed to launch job: {e}"
        with _lock:
            _jobs[job_id].update(
                status="failed", returncode=None, output=output,
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
            _write_last_run(_jobs[job_id])
            _write_log_row(job_id, status="failed", returncode=None, output=output, finished_at=datetime.now(timezone.utc))
        _notify_result("failed", None, output)
    finally:
        with _lock:
            _current_job_id = None


def run_talend_job(trigger_type: str, triggered_by: str = "") -> dict:
    """
    Shared entry point for both the manual button (trigger_refresh) and
    the scheduler (talend/scheduler.py). Returns {"job_id", "status", "already_running"}.
    """
    global _current_job_id
    with _lock:
        if _current_job_id is not None:
            return {"job_id": _current_job_id, "status": _jobs[_current_job_id]["status"], "already_running": True}

        bat_path = settings.TALEND_JOB_PATH
        job_dir = str(settings.TALEND_JOB_DIR)

        job_id = str(uuid.uuid4())
        started_at = datetime.now(timezone.utc)
        _jobs[job_id] = {
            "status": "running", "returncode": None, "output": "",
            "started_at": started_at.isoformat(), "finished_at": None,
        }
        _current_job_id = job_id

    try:
        EtlRunLog.objects.create(
            job_id=job_id, trigger_type=trigger_type, triggered_by=triggered_by or "",
            status="running", started_at=started_at,
        )
    except Exception:
        pass

    thread = threading.Thread(target=_run_job, args=(job_id, bat_path, job_dir), daemon=True)
    thread.start()

    return {"job_id": job_id, "status": "running", "already_running": False}


def trigger_refresh(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    triggered_by = ""
    if request.body:
        try:
            payload = json.loads(request.body)
            triggered_by = (payload.get("triggered_by") or "")[:255]
        except (json.JSONDecodeError, AttributeError):
            pass

    result = run_talend_job(trigger_type="manual", triggered_by=triggered_by)
    return JsonResponse(result)


def refresh_status(request, job_id):
    with _lock:
        job = _jobs.get(job_id)
    if job is None:
        return JsonResponse({"error": "Unknown job_id"}, status=404)
    return JsonResponse({"job_id": job_id, **job})


def last_run(request):
    try:
        row = EtlRunLog.objects.exclude(status="running").order_by("-started_at").first()
        if row is not None:
            return JsonResponse({
                "job_id": row.job_id, "status": row.status, "returncode": row.returncode,
                "output": row.output,
                "started_at": row.started_at.isoformat() if row.started_at else None,
                "finished_at": row.finished_at.isoformat() if row.finished_at else None,
            })
    except Exception:
        pass

    if not settings.TALEND_LAST_RUN_FILE.exists():
        return JsonResponse({"job_id": None, "status": None})
    try:
        with open(settings.TALEND_LAST_RUN_FILE) as f:
            data = json.load(f)
        return JsonResponse(data)
    except (OSError, json.JSONDecodeError):
        return JsonResponse({"job_id": None, "status": None})


def etl_history(request):
    """History list for the Talend page — every run, manual or scheduled, newest first."""
    try:
        limit = max(1, min(int(request.GET.get("limit", 20)), 100))
    except ValueError:
        limit = 20

    rows = EtlRunLog.objects.order_by("-started_at")[:limit]
    return JsonResponse({
        "results": [
            {
                "job_id": r.job_id, "trigger_type": r.trigger_type, "triggered_by": r.triggered_by,
                "status": r.status, "returncode": r.returncode,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            }
            for r in rows
        ]
    })