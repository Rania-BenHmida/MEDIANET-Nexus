"""
dropdowns/services.py
Inserts new rows into DW dimension tables with auto-incremented PKs.
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse
from psycopg2 import pool

from db import get_warehouse_conn, release_warehouse_conn

def _next_id(cur, table: str, pk_col: str) -> int:
    cur.execute(f'SELECT COALESCE(MAX("{pk_col}"), 0) + 1 AS next_id FROM public."{table}"')
    return cur.fetchone()["next_id"]


# ── Dim_Agent ─────────────────────────────────────────────────────────────────
# Required: Agent_FullName, manager, regional_office

def add_agent(full_name: str, manager: str, regional_office: str) -> dict:
    full_name       = full_name.strip()
    manager         = manager.strip()
    regional_office = regional_office.strip()

    if not full_name:
        raise ValueError("Agent full name is required.")
    if not manager:
        raise ValueError("Manager is required.")
    if not regional_office:
        raise ValueError("Regional office is required.")

    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "ID_Agent" FROM public."Dim_Agent" WHERE LOWER("Agent_FullName") = LOWER(%s)',
                (full_name,),
            )
            if cur.fetchone():
                raise ValueError(f"Agent '{full_name}' already exists.")

            new_id = _next_id(cur, "Dim_Agent", "ID_Agent")
            cur.execute(
                """
                INSERT INTO public."Dim_Agent"
                    ("ID_Agent", "Agent_FullName", "manager", "regional_office")
                VALUES (%s, %s, %s, %s)
                """,
                (new_id, full_name, manager, regional_office),
            )
        conn.commit()
        return {"id": new_id, "Agent_FullName": full_name}
    except Exception:
        conn.rollback()
        raise
    finally:
        release_warehouse_conn(conn)


# ── Dim_Company ───────────────────────────────────────────────────────────────
# Required: company name. code_company = "ACC-" + zero-padded next ID (e.g. ACC-007).
# All other columns are optional.

def add_company(
        company_name: str,
        industry: str | None = None,
        headquarters: str | None = None,
        year_established: int | None = None,
        revenue: float | None = None,
        employees: int | None = None,
) -> dict:
    company_name = company_name.strip()
    if not company_name:
        raise ValueError("Company name is required.")

    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "ID_Company" FROM public."Dim_Company" WHERE LOWER("company") = LOWER(%s)',
                (company_name,),
            )
            if cur.fetchone():
                raise ValueError(f"Company '{company_name}' already exists.")

            new_id       = _next_id(cur, "Dim_Company", "ID_Company")
            code_company = f"ACC-{new_id:03d}"

            cur.execute(
                """
                INSERT INTO public."Dim_Company"
                ("ID_Company", "code_company", "company",
                 "Industry", "headquarters", "year_established", "revenue", "employees")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (new_id, code_company, company_name,
                 industry or None, headquarters or None,
                 year_established or None, revenue or None, employees or None),
            )
        conn.commit()
        return {"id": new_id, "code_company": code_company, "company": company_name}
    except Exception:
        conn.rollback()
        raise
    finally:
        release_warehouse_conn(conn)


# ── Dim_Stage ─────────────────────────────────────────────────────────────────
# stage_group = "Open" | "Closed"
# Is_Closed   = stage_group == "Closed"
# Is_Won      = always False

def add_stage(stage_name: str, stage_group: str) -> dict:
    stage_name  = stage_name.strip()
    stage_group = stage_group.strip()

    if not stage_name:
        raise ValueError("Stage name is required.")
    if stage_group not in ("Open", "Closed"):
        raise ValueError("Stage group must be 'Open' or 'Closed'.")

    is_closed = stage_group == "Closed"

    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "ID_Stage" FROM public."Dim_Stage" WHERE LOWER("Stage_Name") = LOWER(%s)',
                (stage_name,),
            )
            if cur.fetchone():
                raise ValueError(f"Stage '{stage_name}' already exists.")

            new_id = _next_id(cur, "Dim_Stage", "ID_Stage")
            cur.execute(
                """
                INSERT INTO public."Dim_Stage"
                    ("ID_Stage", "Stage_Name", "Is_Closed", "Is_Won", "Stage_Group")
                VALUES (%s, %s, %s, false, %s)
                """,
                (new_id, stage_name, is_closed, stage_group),
            )
        conn.commit()
        return {"id": new_id, "Stage_Name": stage_name, "Stage_Group": stage_group}
    except Exception:
        conn.rollback()
        raise
    finally:
        release_warehouse_conn(conn)


# ── Dim_Employee ──────────────────────────────────────────────────────────────
# Required: full_name. Employee_Code = "EMP-" + zero-padded next ID.
# NOTE: schema has both `full_name` and `name` columns on Dim_Employee — we
# mirror full_name into both until you tell us `name` means something else.

def add_employee(full_name: str, role: str | None = None, email: str | None = None) -> dict:
    full_name = full_name.strip()
    if not full_name:
        raise ValueError("Employee full name is required.")

    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "ID_Employee" FROM public."Dim_Employee" WHERE LOWER("full_name") = LOWER(%s)',
                (full_name,),
            )
            if cur.fetchone():
                raise ValueError(f"Employee '{full_name}' already exists.")

            new_id = _next_id(cur, "Dim_Employee", "ID_Employee")
            employee_code = f"EMP-{new_id:04d}"

            cur.execute(
                """
                INSERT INTO public."Dim_Employee"
                ("ID_Employee", "Employee_Code", "full_name", "name", "email", "role", "joined_at")
                VALUES (%s, %s, %s, %s, %s, %s, now())
                """,
                (new_id, employee_code, full_name, full_name, email or None, role or None),
            )
        conn.commit()
        return {"id": new_id, "Employee_Code": employee_code, "full_name": full_name}
    except Exception:
        conn.rollback()
        raise
    finally:
        release_warehouse_conn(conn)


# ── Dim_Tag ───────────────────────────────────────────────────────────────────
# Required: name. color optional, defaults to neutral gray.

def add_tag(name: str, color: str | None = None) -> dict:
    name = name.strip()
    if not name:
        raise ValueError("Tag name is required.")

    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "ID_Tag" FROM public."Dim_Tag" WHERE LOWER("name") = LOWER(%s)',
                (name,),
            )
            if cur.fetchone():
                raise ValueError(f"Tag '{name}' already exists.")

            new_id = _next_id(cur, "Dim_Tag", "ID_Tag")
            cur.execute(
                """
                INSERT INTO public."Dim_Tag" ("ID_Tag", "name", "color", "created_at")
                VALUES (%s, %s, %s, now())
                """,
                (new_id, name, color or "#64748b"),
            )
        conn.commit()
        return {"id": new_id, "name": name, "color": color or "#64748b"}
    except Exception:
        conn.rollback()
        raise
    finally:
        release_warehouse_conn(conn)

def list_sections() -> list[dict]:
    """All sections from Dim_Section, for the project Section dropdown.
    Returns [{code, name}] deduped/ordered by name."""
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT "section_code" AS code, "section_name" AS name
                        FROM public."Dim_Section"
                        WHERE "section_name" IS NOT NULL AND TRIM("section_name") <> ''
                        ORDER BY "section_name"
                        """)
            return [dict(r) for r in cur.fetchall()]
    finally:
        release_warehouse_conn(conn)


def add_section(name: str) -> dict:
    """Add a section to Dim_Section, deduped by name (case-insensitive).
    Returns the existing or newly-created {code, name}. section_code is a
    UUID (matches the existing format in your data)."""
    clean = (name or "").strip()
    if not clean:
        raise ValueError("Section name is required.")
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            # Dedupe by name — return existing if present
            cur.execute("""
                        SELECT "section_code" AS code, "section_name" AS name
                        FROM public."Dim_Section"
                        WHERE LOWER(TRIM("section_name")) = LOWER(%s)
                            LIMIT 1
                        """, (clean,))
            existing = cur.fetchone()
            if existing:
                return dict(existing)

            import uuid
            new_id = _next_id(cur, 'public."Dim_Section"', '"ID_Section"')
            code = str(uuid.uuid4())
            cur.execute("""
                        INSERT INTO public."Dim_Section" ("ID_Section", "section_code", "section_name")
                        VALUES (%s, %s, %s)
                        """, (new_id, code, clean))
        conn.commit()
        return {"code": code, "name": clean}
    except Exception:
        conn.rollback()
        raise
    finally:
        release_warehouse_conn(conn)


def list_project_teams() -> list[str]:
    """Distinct non-empty Team_Name values from Dim_Project — suggestions for
    the free-text Team dropdown. Team is NOT a controlled dimension; new teams
    are saved as plain text on the project, this just powers autocomplete."""
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT DISTINCT TRIM("Team_Name") AS team
                        FROM public."Dim_Project"
                        WHERE "Team_Name" IS NOT NULL AND TRIM("Team_Name") <> ''
                        ORDER BY team
                        """)
            return [r["team"] for r in cur.fetchall()]
    finally:
        release_warehouse_conn(conn)

def list_employee_teams() -> list[str]:
    """Distinct non-empty Dim_Employee.name values — the employee 'team'
    (name column is repurposed to hold team). Powers the Team dropdown in
    the Add-Employee popover."""
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT DISTINCT TRIM("name") AS team
                        FROM public."Dim_Employee"
                        WHERE "name" IS NOT NULL AND TRIM("name") <> ''
                        ORDER BY team
                        """)
            return [r["team"] for r in cur.fetchall()]
    finally:
        release_warehouse_conn(conn)