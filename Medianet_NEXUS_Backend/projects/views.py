"""
projects/views.py

GET  /api/projects/                 → list projects
POST /api/projects/                 → create project (direct warehouse write)
GET  /api/projects/<pk>/            → get single project
PATCH /api/projects/<pk>/           → narrow update (status/dates/description/owner/company)

GET    /api/projects/tasks/                        → list tasks (grouped, with comments[])
POST   /api/projects/tasks/create/                  → create pending task (staging)
GET    /api/projects/tasks/<pk>/                    → get single task
PATCH  /api/projects/tasks/<pk>/                    → narrow update (tag/completed/due_date/end_date)
DELETE /api/projects/tasks/pending/<task_id>/delete/ → safe delete (staging)
DELETE /api/projects/tasks/<pk>/delete/             → destructive delete (warehouse)
"""

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .services import (
    list_projects, get_project, create_project, update_project,
    list_tasks, get_task, create_pending_task, update_task,
    delete_pending_task, delete_historical_task,list_project_statuses,
)

@api_view(["GET"])
def project_statuses(request):
    try:
        return Response(list_project_statuses())
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Projects ──────────────────────────────────────────────────────────────────

def _project_filters(request):
    return {
        "status":       request.query_params.get("status"),
        "owner_name":   request.query_params.get("owner_name"),
        "company_name": request.query_params.get("company_name"),
    }


@api_view(["GET", "POST"])
def projects_collection(request):
    if request.method == "GET":
        try:
            return Response(list_projects(_project_filters(request)))
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    try:
        created = create_project(request.data)
        return Response(created, status=status.HTTP_201_CREATED)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET", "PATCH"])
def project_detail(request, pk: int):
    if request.method == "GET":
        proj = get_project(pk)
        if proj is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(proj)

    try:
        updated = update_project(pk, request.data)
        return Response(updated)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Tasks ─────────────────────────────────────────────────────────────────────

def _task_filters(request):
    return {
        "project_id": request.query_params.get("project_id"),
        "tag_name":   request.query_params.get("tag_name"),
        "completed":  request.query_params.get("completed"),
    }


@api_view(["GET"])
def tasks_list(request):
    try:
        return Response(list_tasks(_task_filters(request)))
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
def create_task(request):
    try:
        result = create_pending_task(request.data)
        return Response(result, status=status.HTTP_201_CREATED)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET", "PATCH"])
def task_detail(request, pk: int):
    if request.method == "GET":
        task = get_task(pk)
        if task is None:
            return Response({"error": "Task not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(task)

    try:
        updated = update_task(pk, request.data)
        return Response(updated)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["DELETE"])
def delete_pending(request, task_id: str):
    try:
        delete_pending_task(task_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["DELETE"])
def delete_historical(request, pk: int):
    try:
        delete_historical_task(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)