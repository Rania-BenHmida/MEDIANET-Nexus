from django.urls import path
from . import views

urlpatterns = [
    path("", views.list_insights),
    path("<str:category>/refresh/", views.refresh_insight),
]