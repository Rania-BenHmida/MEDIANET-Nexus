"""
insights/models.py

Cached AI-generated insight cards for the Overview dashboard, split into
four categories that mirror how each role actually accesses data:

    revenue_deals       — Fact_Opportunity / Fact_Subscription (executive, admin,
                           superadmin, commercial)
    customer_churn_b2c  — Fact_Churn, consumer accounts (executive, admin,
                           superadmin, customer_success)
    customer_churn_b2b  — Fact_Subscription / Fact_Ticket, company accounts
                           (executive, admin, superadmin, customer_success,
                           commercial)
    projects            — Fact_Log (executive, admin, superadmin, project_manager)

One row per category — regenerated on demand via the "Refresh" button in
each dashboard section, never on every page load, so viewing the overview
stays fast and doesn't burn an LLM call per visit. Reuses the same
overwrite-in-place pattern as surveys.SurveyVerdict: every regeneration
replaces the row rather than growing a history table.

Lives in its own small app rather than inside `surveys`, but is routed to
the same operational "surveys" database (see config/db_router.py) — this
is cross-domain platform data, not warehouse data, so it must never land
in the Talend-owned DW.
"""

from django.db import models


class InsightCategory(models.TextChoices):
    REVENUE_DEALS = "revenue_deals", "Revenue & Deals"
    CUSTOMER_CHURN_B2C = "customer_churn_b2c", "B2C Customers & Churn"
    CUSTOMER_CHURN_B2B = "customer_churn_b2b", "B2B Customers & Churn"
    PROJECTS = "projects", "Projects"


class InsightStatus(models.TextChoices):
    READY = "ready", "Ready"
    FAILED = "failed", "Failed"


class DashboardInsight(models.Model):
    category = models.CharField(max_length=25, choices=InsightCategory.choices, unique=True)
    status = models.CharField(max_length=10, choices=InsightStatus.choices, default=InsightStatus.READY)
    items = models.JSONField(
        default=list, blank=True,
        help_text='List of {"tone": "primary|warning|destructive", "title": str, "body": str}, max 3 items.',
    )
    model_used = models.CharField(max_length=100, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    generated_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"DashboardInsight({self.category}) [{self.status}]"