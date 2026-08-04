from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .services import (
    get_deals_stats,
    list_deals,
    list_open_deals,
    list_closed_deals,
    get_deal,
    create_pending_deal,
    update_pending_deal,
    update_closed_deal,
    delete_pending_deal,
    delete_warehouse_deal,
)


# ── Stats ─────────────────────────────────────────────────────────────────────

@api_view(["GET"])
def deals_stats(request):
    try:
        return Response(get_deals_stats())
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── List — warehouse (Fact_Opportunity + dimensions) ─────────────────────────

def _filters_from_request(request):
    return {
        "stage_name":   request.query_params.get("stage_name"),
        "agent_name":   request.query_params.get("agent_name"),
        "company_name": request.query_params.get("company_name"),
        "plan_name":    request.query_params.get("plan_name"),
        "is_closed":    request.query_params.get("is_closed"),
        "is_won":       request.query_params.get("is_won"),
        "stage_group":  request.query_params.get("stage_group"),
    }


@api_view(["GET"])
def deals_list(request):
    """
    GET /api/deals/
    Optional query params: ?stage_name=&agent_name=&company_name=&plan_name=
                            &is_closed=true|false&is_won=true|false
                            &stage_group=Open|Closed
    """
    try:
        return Response(list_deals(_filters_from_request(request)))
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
def deals_open(request):
    """
    GET /api/deals/open/
    Deals whose Dim_Stage.Stage_Group = 'Open' (Prospecting, Engaging, Qualification…).
    Accepts the same optional filters as deals_list (stage_group is fixed to 'Open').
    """
    try:
        return Response(list_open_deals(_filters_from_request(request)))
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
def deals_closed(request):
    """
    GET /api/deals/closed/
    Deals whose Dim_Stage.Stage_Group = 'Closed' (Won, Lost).
    Accepts the same optional filters as deals_list (stage_group is fixed to 'Closed').
    """
    try:
        return Response(list_closed_deals(_filters_from_request(request)))
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Get single — warehouse ────────────────────────────────────────────────────

@api_view(["GET"])
def deal_detail(request, pk: int):
    """GET /api/deals/<pk>/  — pk is the warehouse ID_Opportunity (integer)."""
    try:
        deal = get_deal(pk)
        if deal is None:
            return Response({"error": "Deal not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(deal)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Create — staging ──────────────────────────────────────────────────────────

@api_view(["POST"])
def create_deal(request):
    """POST /api/deals/create/"""
    try:
        result = create_pending_deal(request.data)
        return Response(result, status=status.HTTP_201_CREATED)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Update — staging (pending deal only) ─────────────────────────────────────

@api_view(["PATCH"])
def update_deal(request, opportunity_id: str):
    """
    PATCH /api/deals/pending/<opportunity_id>/
    opportunity_id is the staging UUID — only pending (not-yet-loaded) deals
    can be edited. Warehouse rows are read-only.
    """
    try:
        updated = update_pending_deal(opportunity_id, request.data)
        return Response(updated)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Update — warehouse (closed deal only, close_value/close_date) ───────────

@api_view(["PATCH"])
def update_closed(request, pk: int):
    """
    PATCH /api/deals/<pk>/close-correction/
    Edits ONLY close_value and/or close_date on a Closed (Won/Lost) deal.
    Rejected if the deal's Stage_Group is 'Open' — use the delete endpoint
    for open deals instead. Agent/company/plan/stage are not editable here.
    """
    try:
        updated = update_closed_deal(pk, request.data)
        return Response(updated)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

from .services import (
    get_deals_stats,
    list_deals,
    list_open_deals,
    list_closed_deals,
    get_deal,
    create_pending_deal,
    update_pending_deal,
    update_closed_deal,
    update_open_deal,          # ← add this
    delete_pending_deal,
    delete_warehouse_deal,
)
# ── Update — warehouse (open deal only, stage/close_value/close_date) ───────

@api_view(["PATCH"])
def update_open(request, pk: int):
    """
    PATCH /api/deals/<pk>/open-correction/
    Edits stage, close_value, and/or close_date on an Open deal.
    Rejected if the deal's Stage_Group is 'Closed' — use the close-correction
    endpoint for closed deals instead. Agent/company/plan are not editable here.
    """
    try:
        updated = update_open_deal(pk, request.data)
        return Response(updated)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
# ── Delete — staging (pending deal) ───────────────────────────────────────────

@api_view(["DELETE"])
def delete_pending(request, opportunity_id: str):
    """
    DELETE /api/deals/pending/<opportunity_id>/
    Safe delete — removes a not-yet-loaded deal from the staging queue.
    """
    try:
        delete_pending_deal(opportunity_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Delete — warehouse (historical deal) ─────────────────────────────────────

@api_view(["DELETE"])
def delete_historical(request, pk: int):
    """
    DELETE /api/deals/<pk>/
    ⚠️ DESTRUCTIVE — permanently removes a row from Fact_Opportunity.
    Affects historical stats/reporting and is not reversible. See
    services.delete_warehouse_deal for full risk notes.
    """
    try:
        delete_warehouse_deal(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)