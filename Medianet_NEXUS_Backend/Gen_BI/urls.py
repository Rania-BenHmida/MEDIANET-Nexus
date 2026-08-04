from django.urls import path

from . import views

urlpatterns = [
    path("ask/", views.ask),
    path("transcribe/", views.transcribe),
    path("debug/validate/", views.debug_validate),
]