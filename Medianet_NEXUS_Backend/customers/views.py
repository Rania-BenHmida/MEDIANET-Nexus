from django.shortcuts import render

# Create your views here.
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .services import get_customers_list, get_company_profile

@api_view(["GET"])
def customers_list(request):
    """GET /api/customers/  — CRM-style listing, only companies with real activity."""
    try:
        return Response(get_customers_list())
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
def customer_detail(request, company_id: int):
    """GET /api/customers/<company_id>/  — the fiche client."""
    try:
        profile = get_company_profile(company_id)
        if profile is None:
            return Response({"error": "Company not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(profile)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)