from django.urls import path
from . import views

urlpatterns = [
    path("send-account-email/", views.send_account_email),
]