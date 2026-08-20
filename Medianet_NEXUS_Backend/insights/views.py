from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from . import services


def _err(e: Exception, code=status.HTTP_500_INTERNAL_SERVER_ERROR):
    return Response({"error": str(e)}, status=code)


@api_view(["GET"])
def list_insights(request):
    """GET /api/insights/?categories=revenue_deals,customer_churn_b2b
    Cached read only — never triggers generation. Omit `categories` to get
    all four. The frontend is responsible for only requesting categories
    the current user's role can see; this endpoint has no auth layer of
    its own (same as the rest of the Django backend today)."""
    raw = request.query_params.get("categories", "")
    categories = [c.strip() for c in raw.split(",") if c.strip()] or None
    try:
        return Response(services.get_insights(categories))
    except Exception as e:
        return _err(e)


@api_view(["POST"])
def refresh_insight(request, category: str):
    """POST /api/insights/<category>/refresh/
    Synchronous — runs several grounded Gen BI questions plus one synthesis
    call, so this can take 10-30s. Overwrites the cached row in place."""
    try:
        return Response(services.generate_insights(category))
    except ValueError as e:
        return _err(str(e), status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return _err(e)