"""
dropdowns/views.py
GET  /api/dropdowns/companies/        → list  { id, name }[]
POST /api/dropdowns/companies/        → create company
GET  /api/dropdowns/plans/            → list  string[]
GET  /api/dropdowns/agents/           → list  string[]
POST /api/dropdowns/agents/           → create agent
GET  /api/dropdowns/agents/managers/  → list  string[]  (distinct managers)
GET  /api/dropdowns/agents/offices/   → list  string[]  (distinct regional_offices)
GET  /api/dropdowns/stages/           → list  string[]
POST /api/dropdowns/stages/           → create stage
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from db import get_warehouse_conn, release_warehouse_conn

from .services import add_agent, add_company, add_stage




# ── Companies ─────────────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
def companies(request):
    if request.method == "GET":
        conn = get_warehouse_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                            SELECT DISTINCT dc."ID_Company" AS id, dc."company" AS name
                            FROM public."Dim_Company" dc
                                     INNER JOIN public."Fact_Opportunity" fo ON dc."ID_Company" = fo."ID_Company"
                            WHERE dc."company" IS NOT NULL
                            ORDER BY dc."company"
                            """)
                return Response([dict(r) for r in cur.fetchall()])
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            release_warehouse_conn(conn)

    # POST
    d = request.data
    try:
        result = add_company(
            company_name     = (d.get("company_name") or "").strip(),
            industry         = d.get("industry") or None,
            headquarters     = d.get("headquarters") or None,
            year_established = int(d["year_established"]) if d.get("year_established") else None,
            revenue          = float(d["revenue"]) if d.get("revenue") else None,
            employees        = int(d["employees"]) if d.get("employees") else None,
        )
        return Response({"id": result["id"], "name": result["company"]}, status=status.HTTP_201_CREATED)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
def company_industries(request):
    """Distinct Industry values from Dim_Company."""
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT DISTINCT "Industry"
                        FROM public."Dim_Company"
                        WHERE "Industry" IS NOT NULL
                        ORDER BY "Industry"
                        """)
            return Response([r["Industry"] for r in cur.fetchall()])
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    finally:
        release_warehouse_conn(conn)


@api_view(["GET"])
def company_headquarters(request):
    """Distinct headquarters values from Dim_Company."""
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT DISTINCT "headquarters"
                        FROM public."Dim_Company"
                        WHERE "headquarters" IS NOT NULL
                        ORDER BY "headquarters"
                        """)
            return Response([r["headquarters"] for r in cur.fetchall()])
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    finally:
        release_warehouse_conn(conn)


# ── Plans (read-only — no Add new) ────────────────────────────────────────────

@api_view(["GET"])
def plans(request):
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT "plan_name" FROM public."Dim_Plan" ORDER BY "plan_name"')
            return Response([r["plan_name"] for r in cur.fetchall()])
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    finally:
        release_warehouse_conn(conn)


# ── Agents ────────────────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
def agents(request):
    if request.method == "GET":
        conn = get_warehouse_conn()
        try:
            with conn.cursor() as cur:
                cur.execute('SELECT "Agent_FullName" FROM public."Dim_Agent" ORDER BY "Agent_FullName"')
                return Response([r["Agent_FullName"] for r in cur.fetchall()])
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            release_warehouse_conn(conn)

    # POST
    d = request.data
    try:
        result = add_agent(
            full_name       = (d.get("full_name") or "").strip(),
            manager         = (d.get("manager") or "").strip(),
            regional_office = (d.get("regional_office") or "").strip(),
        )
        return Response({"Agent_FullName": result["Agent_FullName"]}, status=status.HTTP_201_CREATED)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
def agent_managers(request):
    """Distinct manager values from Dim_Agent — used to populate the manager dropdown."""
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT DISTINCT "manager"
                        FROM public."Dim_Agent"
                        WHERE "manager" IS NOT NULL
                        ORDER BY "manager"
                        """)
            return Response([r["manager"] for r in cur.fetchall()])
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    finally:
        release_warehouse_conn(conn)


@api_view(["GET"])
def agent_offices(request):
    """Distinct regional_office values from Dim_Agent — used to populate the office dropdown."""
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT DISTINCT "regional_office"
                        FROM public."Dim_Agent"
                        WHERE "regional_office" IS NOT NULL
                        ORDER BY "regional_office"
                        """)
            return Response([r["regional_office"] for r in cur.fetchall()])
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    finally:
        release_warehouse_conn(conn)


# ── Stages ────────────────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
def stages(request):
    if request.method == "GET":
        conn = get_warehouse_conn()
        try:
            with conn.cursor() as cur:
                cur.execute('SELECT "Stage_Name" FROM public."Dim_Stage" ORDER BY "Stage_Name"')
                return Response([r["Stage_Name"] for r in cur.fetchall()])
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            release_warehouse_conn(conn)

    # POST
    d = request.data
    try:
        result = add_stage(
            stage_name  = (d.get("stage_name") or "").strip(),
            stage_group = (d.get("stage_group") or "").strip(),
        )
        return Response({"Stage_Name": result["Stage_Name"]}, status=status.HTTP_201_CREATED)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

from .services import add_agent, add_company, add_stage, add_employee  # add add_employee


@api_view(["GET", "POST"])
def employees(request):
    if request.method == "GET":
        q = request.query_params.get("q", "").strip()
        conn = get_warehouse_conn()
        try:
            with conn.cursor() as cur:
                if q:
                    cur.execute(
                        'SELECT "ID_Employee" AS id, "full_name" AS name FROM public."Dim_Employee" '
                        'WHERE "full_name" ILIKE %s ORDER BY "full_name" LIMIT 50',
                        (f"%{q}%",),
                    )
                else:
                    cur.execute(
                        'SELECT "ID_Employee" AS id, "full_name" AS name FROM public."Dim_Employee" '
                        'ORDER BY "full_name" LIMIT 50'
                    )
                return Response([dict(r) for r in cur.fetchall()])
        except Exception as e:                                    # ← add
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)  # ← add
        finally:
            release_warehouse_conn(conn)

    d = request.data
    try:
        result = add_employee(
            full_name=(d.get("full_name") or "").strip(),
            role=d.get("role") or None,
            email=d.get("email") or None,
        )
        return Response(result, status=status.HTTP_201_CREATED)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
def companies_all(request):
    """Every Dim_Company row, regardless of whether a deal references it yet.
    Shared pool used by the Project company popover so Deals and Projects
    never end up creating duplicate company rows."""
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT "ID_Company" AS id, "company" AS name
                FROM public."Dim_Company"
                WHERE "company" IS NOT NULL
                ORDER BY "company"
                """
            )
            return Response([dict(r) for r in cur.fetchall()])
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    finally:
        release_warehouse_conn(conn)

from .services import add_agent, add_company, add_stage, add_employee, add_tag  # add add_tag


@api_view(["GET", "POST"])
def tags(request):
    if request.method == "GET":
        conn = get_warehouse_conn()
        try:
            with conn.cursor() as cur:
                cur.execute('SELECT "ID_Tag" AS id, "name", "color" FROM public."Dim_Tag" ORDER BY "name"')
                return Response([dict(r) for r in cur.fetchall()])
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            release_warehouse_conn(conn)

    d = request.data
    try:
        result = add_tag(name=(d.get("name") or "").strip(), color=d.get("color") or None)
        return Response(result, status=status.HTTP_201_CREATED)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

from .services import list_sections, add_section, list_project_teams

@api_view(["GET", "POST"])
def sections(request):
    try:
        if request.method == "POST":
            name = (request.data or {}).get("name", "")
            return Response(add_section(name), status=status.HTTP_201_CREATED)
        return Response(list_sections())
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(["GET"])
def project_teams(request):
    try:
        return Response(list_project_teams())
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

from .services import list_employee_teams

@api_view(["GET"])
def employee_teams(request):
    try:
        return Response(list_employee_teams())
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)