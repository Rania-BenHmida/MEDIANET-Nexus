from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .services import get_overview_stats


@api_view(["GET"])
def overview_stats(request):
    """GET /api/dashboard/stats/ — top-level KPI strip for the Executive Overview page."""
    try:
        return Response(get_overview_stats())
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)