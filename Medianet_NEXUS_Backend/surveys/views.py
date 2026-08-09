from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from . import services


def _err(e: Exception, code=status.HTTP_500_INTERNAL_SERVER_ERROR):
    return Response({"error": str(e)}, status=code)


# ── Templates ─────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
def templates_list(request):
    """
    GET  /api/surveys/templates/?industry=&service_category=&active_only=
    POST /api/surveys/templates/   body: {name, industry, service_category, description, is_default, is_active}
    """
    if request.method == "GET":
        try:
            active_only = request.query_params.get("active_only", "true").lower() != "false"
            return Response(services.list_templates(
                industry=request.query_params.get("industry"),
                service_category=request.query_params.get("service_category"),
                active_only=active_only,
            ))
        except Exception as e:
            return _err(e)
    try:
        return Response(services.create_template(request.data), status=status.HTTP_201_CREATED)
    except KeyError as e:
        return _err(f"Missing required field: {e}", status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return _err(e)


@api_view(["GET", "PATCH", "DELETE"])
def template_detail(request, template_id: int):
    """GET/PATCH/DELETE /api/surveys/templates/<template_id>/  (DELETE = soft delete, sets is_active=False)"""
    if request.method == "GET":
        data = services.get_template_detail(template_id)
        if data is None:
            return Response({"error": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)
    if request.method == "PATCH":
        data = services.update_template(template_id, request.data)
        if data is None:
            return Response({"error": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)
    ok = services.deactivate_template(template_id)
    if not ok:
        return Response({"error": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
def resolve_template(request, code_company: str):
    """GET /api/surveys/templates/resolve/<code_company>/?service_category=  — the 'smart pick' endpoint."""
    try:
        data = services.resolve_template_for_company(
            code_company, service_category=request.query_params.get("service_category")
        )
        if data is None:
            return Response({"error": "No active template available (not even a default). Create one first."}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)
    except Exception as e:
        return _err(e)


# ── Questions ─────────────────────────────────────────────────────────

@api_view(["POST"])
def question_create(request, template_id: int):
    """POST /api/surveys/templates/<template_id>/questions/"""
    try:
        data = services.add_question(template_id, request.data)
        if data is None:
            return Response({"error": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(data, status=status.HTTP_201_CREATED)
    except KeyError as e:
        return _err(f"Missing required field: {e}", status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return _err(e)


@api_view(["PATCH", "DELETE"])
def question_detail(request, question_id: int):
    """
    PATCH  /api/surveys/questions/<question_id>/
    DELETE /api/surveys/questions/<question_id>/
      -> {"deleted": true, "deactivated": false}  if it had no answers (hard delete)
      -> {"deleted": false, "deactivated": true}  if it had answers (soft, is_active=False)
    """
    if request.method == "PATCH":
        data = services.update_question(question_id, request.data)
        if data is None:
            return Response({"error": "Question not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)
    result = services.delete_question(question_id)
    if result is None:
        return Response({"error": "Question not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(result, status=status.HTTP_200_OK)


# ── Client contacts ──────────────────────────────────────────────────

@api_view(["GET", "POST"])
def contacts(request):
    """
    GET  /api/surveys/contacts/?code_company=123
    POST /api/surveys/contacts/   body: {code_company, full_name, email, role_title, is_primary}
    """
    if request.method == "GET":
        code_company = request.query_params.get("code_company")
        if not code_company:
            return Response({"error": "code_company query param is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(services.list_contacts(code_company))
        except Exception as e:
            return _err(e)
    try:
        return Response(services.create_contact(request.data), status=status.HTTP_201_CREATED)
    except KeyError as e:
        return _err(f"Missing required field: {e}", status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return _err(e)


@api_view(["PATCH", "DELETE"])
def contact_detail(request, contact_id: int):
    """PATCH/DELETE /api/surveys/contacts/<contact_id>/  (DELETE = soft delete, sets is_active=False)"""
    if request.method == "PATCH":
        data = services.update_contact(contact_id, request.data)
        if data is None:
            return Response({"error": "Contact not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)
    ok = services.delete_contact(contact_id)
    if not ok:
        return Response({"error": "Contact not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(status=status.HTTP_204_NO_CONTENT)


# ── Sending ───────────────────────────────────────────────────────────

@api_view(["POST"])
def send_survey(request):
    """POST /api/surveys/send/   body: {template_id, contact_id, expires_in_days?}"""
    try:
        data = services.create_and_send_survey(
            template_id=request.data["template_id"],
            contact_id=request.data["contact_id"],
            expires_in_days=request.data.get("expires_in_days", 14),
        )
        return Response(data, status=status.HTTP_201_CREATED)
    except KeyError as e:
        return _err(f"Missing required field: {e}", status.HTTP_400_BAD_REQUEST)
    except ValueError as e:
        return _err(str(e), status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return _err(e)


# ── Company-level survey views (fiche client) ───────────────────────────

@api_view(["GET"])
def company_surveys(request, code_company: str):
    """GET /api/surveys/company/<code_company>/surveys/ — every survey sent to this company."""
    try:
        return Response(services.list_surveys_for_company(code_company))
    except Exception as e:
        return _err(e)


@api_view(["GET"])
def survey_detail(request, survey_id: int):
    """GET /api/surveys/<survey_id>/ — full detail incl. every Q&A + verdict."""
    data = services.get_survey_full_detail(survey_id)
    if data is None:
        return Response({"error": "Survey not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(data)


@api_view(["POST"])
def survey_verdict(request, survey_id: int):
    """POST /api/surveys/<survey_id>/verdict/ — (re)run the AI verdict/scoring engine."""
    try:
        data = services.generate_survey_verdict(survey_id)
        if data is None:
            return Response({"error": "Survey not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)
    except ValueError as e:
        return _err(str(e), status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return _err(e)


# ── Public survey (no auth — this is the client's side) ────────────────

@api_view(["GET"])
def public_survey_detail(request, token: str):
    """GET /api/surveys/public/<token>/"""
    data = services.get_public_survey(token)
    if data is None:
        return Response({"error": "Survey not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(data)


@api_view(["POST"])
def public_survey_submit(request, token: str):
    """POST /api/surveys/public/<token>/submit/   body: {answers: [{question_id, value}]}"""
    try:
        data = services.submit_survey_responses(token, request.data.get("answers", []))
        return Response(data)
    except ValueError as e:
        return _err(str(e), status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return _err(e)


# ── Client Feedback (global page) ───────────────────────────────────────

@api_view(["GET"])
def companies_overview(request):
    """GET /api/surveys/overview/ — every company with contacts and/or sent
    surveys, each with its latest survey. Powers the Client Feedback page."""
    try:
        return Response(services.list_companies_with_activity())
    except Exception as e:
        return _err(e)


# ── Notifications ─────────────────────────────────────────────────────

@api_view(["GET"])
def list_notifications(request):
    """GET /api/surveys/notifications/?unread_only=true&limit=20"""
    unread_only = request.query_params.get("unread_only") == "true"
    try:
        limit = int(request.query_params.get("limit", 20))
    except ValueError:
        limit = 20
    return Response(services.list_notifications(unread_only=unread_only, limit=limit))


@api_view(["POST"])
def mark_notification_read(request, notification_id: int):
    ok = services.mark_notification_read(notification_id)
    if not ok:
        return Response({"error": "Notification not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response({"ok": True})


@api_view(["POST"])
def mark_all_notifications_read(request):
    count = services.mark_all_notifications_read()
    return Response({"markedRead": count})


@api_view(["DELETE"])
def delete_notification(request, notification_id: int):
    ok = services.delete_notification(notification_id)
    if not ok:
        return Response({"error": "Notification not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["DELETE"])
def delete_all_notifications(request):
    count = services.delete_all_notifications()
    return Response({"deleted": count})