from django.urls import path
from . import views

urlpatterns = [
    path("refresh/", views.trigger_refresh),
    path("refresh/<str:job_id>/status/", views.refresh_status),
    path("last-run/", views.last_run),
    path("history/", views.etl_history),
]