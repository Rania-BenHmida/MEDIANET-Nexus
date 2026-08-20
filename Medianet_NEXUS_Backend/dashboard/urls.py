from django.urls import path
from . import views

urlpatterns = [
    path("stats/", views.overview_stats, name="dashboard-overview-stats"),
]