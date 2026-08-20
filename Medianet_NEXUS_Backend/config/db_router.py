"""
config/db_router.py

NEXUS has two Postgres targets now:
  - "default": DW_CustomerSuccess, the Talend-owned warehouse — read via
    raw SQL through db.py everywhere except here; contenttypes/auth
    migrations also land here, unchanged from before this router existed.
  - "surveys": APP_CustomerSuccess, a dedicated operational DB owned by
    Django itself, holding SurveyTemplate/SurveyQuestion/ClientContact,
    Notification, DashboardInsight, and anything else the platform's own
    apps add later.

OPERATIONAL_APPS lists every app whose models are platform data rather
than warehouse data — they all share the one "surveys" database instead
of each getting their own. Every other app keeps its old raw-SQL-only
behaviour exactly as it was.
"""

OPERATIONAL_APPS = {"surveys", "insights", "talend"}
OPERATIONAL_DB = "surveys"


class SurveysRouter:
    def db_for_read(self, model, **hints):
        if model._meta.app_label in OPERATIONAL_APPS:
            return OPERATIONAL_DB
        return None  # let Django fall back to "default"

    def db_for_write(self, model, **hints):
        if model._meta.app_label in OPERATIONAL_APPS:
            return OPERATIONAL_DB
        return None

    def allow_relation(self, obj1, obj2, **hints):
        labels = {obj1._meta.app_label, obj2._meta.app_label}
        if labels & OPERATIONAL_APPS:
            return labels <= OPERATIONAL_APPS
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label in OPERATIONAL_APPS:
            return db == OPERATIONAL_DB
        return db == "default"