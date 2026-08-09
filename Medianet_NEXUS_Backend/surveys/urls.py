from django.urls import path
from . import views

urlpatterns = [
    path("templates/", views.templates_list),
    path("templates/<int:template_id>/", views.template_detail),
    path("templates/<int:template_id>/questions/", views.question_create),
    path("templates/resolve/<str:code_company>/", views.resolve_template),
    path("questions/<int:question_id>/", views.question_detail),
    path("contacts/", views.contacts),
    path("contacts/<int:contact_id>/", views.contact_detail),
    path("send/", views.send_survey),
    path("company/<str:code_company>/surveys/", views.company_surveys),
    path("overview/", views.companies_overview),
    path("public/<str:token>/", views.public_survey_detail),
    path("public/<str:token>/submit/", views.public_survey_submit),
    path("notifications/", views.list_notifications),
    path("notifications/<int:notification_id>/read/", views.mark_notification_read),
    path("notifications/read-all/", views.mark_all_notifications_read),
    path("notifications/<int:notification_id>/", views.delete_notification),
    path("notifications/clear-all/", views.delete_all_notifications),
    # Kept last: bare "<int:survey_id>/" only matches integers, so it can't
    # shadow any of the string paths above regardless of order — but it's
    # placed last for readability.
    path("<int:survey_id>/", views.survey_detail),
    path("<int:survey_id>/verdict/", views.survey_verdict),
]