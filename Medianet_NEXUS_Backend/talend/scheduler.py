"""
talend/scheduler.py

In-process APScheduler that fires the same Data_Master job as the "Refresh
now" button, every 2 days, tagged trigger_type="scheduled" in EtlRunLog so
the history list on the Talend page shows which runs were automatic.

Guarded against double-starting:
  - Under `runserver` (dev), Django's autoreloader spawns a watcher process
    AND a child process; only the child sets RUN_MAIN=true, so we only
    start the scheduler there — otherwise every autoreload would add a
    second overlapping scheduler.
  - Management commands like migrate/makemigrations/shell/test import the
    app registry too (ready() runs for those as well) but we don't want a
    background scheduler spinning up during a migration — skipped by name.
"""
import logging
import os
import sys

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None

_SKIP_FOR_COMMANDS = {"migrate", "makemigrations", "shell", "collectstatic", "test", "dbshell"}


def _should_start() -> bool:
    if any(cmd in sys.argv for cmd in _SKIP_FOR_COMMANDS):
        return False
    if "runserver" in sys.argv:
        return os.environ.get("RUN_MAIN") == "true"
    # Production entrypoint (gunicorn/waitress) — no reloader involved.
    return True


def start() -> None:
    global _scheduler
    if _scheduler is not None or not _should_start():
        return

    from .views import run_talend_job

    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        lambda: run_talend_job(trigger_type="scheduled"),
        trigger=IntervalTrigger(days=2),
        id="talend_data_master_refresh",
        replace_existing=True,
        misfire_grace_time=3600,  # if the process was down when it should've fired, still run within the hour
        max_instances=1,
    )
    _scheduler.start()
    logger.info("Talend refresh scheduler started — Data_Master will run every 2 days.")