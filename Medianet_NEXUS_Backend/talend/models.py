from django.db import models


class EtlRunLog(models.Model):
    """
    One row per Data_Master run — manual (clicked from the Talend page) or
    scheduled (the every-2-days APScheduler job). This is what the Talend
    page's history list reads; talend_last_run.json still gets written too,
    purely as a legacy fallback in case this table is ever unreachable.
    """

    TRIGGER_CHOICES = [
        ("manual", "Manual"),
        ("scheduled", "Scheduled"),
    ]
    STATUS_CHOICES = [
        ("running", "Running"),
        ("success", "Success"),
        ("failed", "Failed"),
    ]

    job_id = models.CharField(max_length=64, unique=True)
    trigger_type = models.CharField(max_length=16, choices=TRIGGER_CHOICES)
    # Display name/email of whoever clicked "Refresh now" — blank for
    # scheduled runs, since nobody triggered those.
    triggered_by = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="running")
    returncode = models.IntegerField(null=True, blank=True)
    output = models.TextField(blank=True, default="")
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.job_id} ({self.trigger_type}, {self.status})"