from django.urls import path
from . import views

urlpatterns = [
    # Stats dashboard card
    path("stats/", views.deals_stats, name="deals-stats"),

    # Collection — warehouse (read) / staging (create)
    path("",        views.deals_list,   name="deals-list"),
    path("open/",   views.deals_open,   name="deals-list-open"),    # Dim_Stage.Stage_Group = 'Open'
    path("closed/", views.deals_closed, name="deals-list-closed"),  # Dim_Stage.Stage_Group = 'Closed'
    path("create/", views.create_deal,  name="deals-create"),

    # Pending deal (staging) — edit / safe delete
    path("pending/<str:opportunity_id>/", views.update_deal,     name="deals-update-pending"),
    path("pending/<str:opportunity_id>/delete/", views.delete_pending, name="deals-delete-pending"),

    # Historical deal (warehouse) — read single / destructive delete
    # NOTE: must stay below "open/" and "closed/" or Django will try to
    # parse those path segments as an integer pk and 404.
    path("<int:pk>/", views.deal_detail,      name="deals-detail"),
    path("<int:pk>/close-correction/", views.update_closed, name="deals-update-closed"),
    path("<int:pk>/open-correction/", views.update_open, name="deals-update-open"),   # ← add this
    path("<int:pk>/delete/", views.delete_historical, name="deals-delete-historical"),
]