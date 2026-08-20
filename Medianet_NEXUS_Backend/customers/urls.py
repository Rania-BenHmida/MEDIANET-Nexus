from django.urls import path
from . import views

urlpatterns = [
    path("b2b/stats/",         views.customers_b2b_stats, name="customers-b2b-stats"),
    path("b2c/stats/",         views.customers_b2c_stats, name="customers-b2c-stats"),
    path("",                   views.customers_list,      name="customers-list"),
    path("<int:company_id>/",  views.customer_detail,     name="customer-detail"),
]