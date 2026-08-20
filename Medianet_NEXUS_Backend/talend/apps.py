from django.apps import AppConfig


class TalendConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "talend"

    def ready(self):
        from . import scheduler
        scheduler.start()