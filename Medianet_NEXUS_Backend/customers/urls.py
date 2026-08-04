from django.urls import path
from . import views

urlpatterns = [
    path("",                  views.customers_list,  name="customers-list"),
    path("<int:company_id>/", views.customer_detail, name="customer-detail"),

]