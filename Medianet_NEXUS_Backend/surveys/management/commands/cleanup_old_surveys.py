"""
python manage.py cleanup_old_surveys [--quarter-days=90] [--dry-run]

Deletes Survey rows older than one quarter (default: 90 days), counted
from Survey.created_at — but ONLY ones that were never answered, i.e.
status is "sent" or "expired". Completed surveys (and their verdicts +
reports) are never touched by this command, regardless of age — once a
client actually responds, that response is kept for good.

This is a hard delete for the ones it does target: SurveyResponse and
SurveyVerdict are both CASCADE off Survey, so their (empty, since these
were never answered) history goes with it. Nothing else references
Survey via PROTECT, so unlike cleanup_old_templates.py there's no
deactivate-instead fallback needed here — a plain .delete() is safe.

Every execution — real or --dry-run — writes a SurveyCleanupRun row, so
the policy is auditable after the fact instead of being an invisible
background script. See the Client Feedback page in the frontend for a
readable history of these runs.

Meant to run on a schedule at the end of each quarter. If this deployment
already uses Celery Beat elsewhere, wire it in there instead — otherwise
a plain cron entry works fine, e.g.:

    # crontab -e — 03:00 on Jan 1 / Apr 1 / Jul 1 / Oct 1
    0 3 1 1,4,7,10 * cd /path/to/Medianet_NEXUS_Backend && /path/to/venv/bin/python manage.py cleanup_old_surveys

Run with --dry-run first to see what would be deleted without touching
anything — recommended before the first real run, and especially before
lowering --quarter-days below the 90-day default. Dry runs still get
logged to SurveyCleanupRun (was_dry_run=True), so you have a record of
having checked, too.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from surveys.models import Survey, SurveyCleanupRun

# Cap how many individual surveys get snapshotted into SurveyCleanupRun.details
# — enough to show real detail for a defense/audit without the JSON blob
# growing unboundedly if a huge batch gets swept someday.
MAX_SNAPSHOT_ROWS = 200


class Command(BaseCommand):
    help = "Delete UNANSWERED surveys older than one quarter (default 90 days). Completed surveys are never deleted by this command."

    def add_arguments(self, parser):
        parser.add_argument(
            "--quarter-days", type=int, default=90,
            help="Age cutoff in days, measured from Survey.created_at (default 90, i.e. ~1 quarter).",
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would be deleted without deleting anything (still logs a SurveyCleanupRun row).",
        )

    def handle(self, *args, **options):
        cutoff_days = options["quarter_days"]
        is_dry_run = options["dry_run"]
        cutoff = timezone.now() - timedelta(days=cutoff_days)
        # completed is deliberately excluded — only sent/expired (i.e.
        # never answered) surveys are candidates for auto-deletion.
        qs = Survey.objects.filter(created_at__lt=cutoff).exclude(status="completed")
        count = qs.count()

        if count == 0:
            self.stdout.write(self.style.WARNING(f"No unanswered surveys older than {cutoff_days} days — nothing to do."))
            SurveyCleanupRun.objects.create(cutoff_days=cutoff_days, was_dry_run=is_dry_run, deleted_count=0, details=[])
            return

        snapshot = [
            {
                "id": s.id,
                "codeCompany": s.code_company,
                "template": s.template.name,
                "status": s.status,
                "createdAt": s.created_at.isoformat(),
            }
            for s in qs.select_related("template").order_by("-created_at")[:MAX_SNAPSHOT_ROWS]
        ]

        if is_dry_run:
            self.stdout.write(f"Would delete {count} unanswered survey(s) older than {cutoff_days} days:")
            for row in snapshot:
                self.stdout.write(f"  - #{row['id']} {row['template']} -> company {row['codeCompany']} [{row['status']}], created {row['createdAt']}")
            if count > MAX_SNAPSHOT_ROWS:
                self.stdout.write(f"  ...and {count - MAX_SNAPSHOT_ROWS} more")
            self.stdout.write(self.style.WARNING("Dry run — nothing was deleted."))
            SurveyCleanupRun.objects.create(cutoff_days=cutoff_days, was_dry_run=True, deleted_count=count, details=snapshot)
            return

        self.stdout.write(f"Deleting {count} unanswered survey(s) older than {cutoff_days} days...")
        deleted, breakdown = qs.delete()
        self.stdout.write(self.style.SUCCESS(
            f"Done. Deleted {deleted} row(s) total (unanswered surveys + their cascaded rows): {breakdown}"
        ))
        SurveyCleanupRun.objects.create(cutoff_days=cutoff_days, was_dry_run=False, deleted_count=count, details=snapshot)