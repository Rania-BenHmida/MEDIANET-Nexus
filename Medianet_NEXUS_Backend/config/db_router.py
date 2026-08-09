"""
config/db_router.py

NEXUS has two Postgres targets now:
  - "default": DW_CustomerSuccess, the Talend-owned warehouse — read via
    raw SQL through db.py everywhere except here; contenttypes/auth
    migrations also land here, unchanged from before this router existed.
  - "surveys": APP_CustomerSuccess, a dedicated operational DB owned by
    Django itself, holding SurveyTemplate/SurveyQuestion/ClientContact
    and anything else the surveys app adds later.

Only the "surveys" app is routed; every other app keeps its old
behaviour exactly as it was.
"""

SURVEYS_APP = "surveys"
SURVEYS_DB = "surveys"


class SurveysRouter:
    def db_for_read(self, model, **hints):
        if model._meta.app_label == SURVEYS_APP:
            return SURVEYS_DB
        return None  # let Django fall back to "default"

    def db_for_write(self, model, **hints):
        if model._meta.app_label == SURVEYS_APP:
            return SURVEYS_DB
        return None

    def allow_relation(self, obj1, obj2, **hints):
        labels = {obj1._meta.app_label, obj2._meta.app_label}
        if SURVEYS_APP in labels:
            return labels == {SURVEYS_APP}
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label == SURVEYS_APP:
            return db == SURVEYS_DB
        return db == "default"