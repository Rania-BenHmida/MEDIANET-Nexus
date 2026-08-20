from django.shortcuts import render

# Create your views here.
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .services import get_customers_list, get_company_profile, get_b2b_stats, get_b2c_stats


@api_view(["GET"])
def customers_b2b_stats(request):
    """GET /api/customers/b2b/stats/ — KPI cards for the B2B tab."""
    try:
        return Response(get_b2b_stats())
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
def customers_b2c_stats(request):
    """GET /api/customers/b2c/stats/ — KPI cards for the B2C tab."""
    try:
        return Response(get_b2c_stats())
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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