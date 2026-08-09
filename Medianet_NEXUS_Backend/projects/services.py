"""
projects/services.py

Two entities live here:

  Project (Dim_Project) — a warehouse DIMENSION with full CRUD, written to
  directly (no staging/Talend step) — same pattern as Dim_Company/Dim_Agent/
  Dim_Stage in the dropdowns app. Project owns Owner, Company and Section,
  since all three are project-level concepts in this business (who runs the
  project, which client it's for, which section it sits in) — NOT per-task.

    Owner/Company/Section are stored OUT of the warehouse, in the staging
    table "Projects"."CRM_Project_Meta", keyed by BUSINESS CODE (not integer
    FK). Dim_Project is never altered — the abandoned plan to ADD COLUMN
    ID_Owner/ID_Company was dropped because Talend owns that table and
    wouldn't know about the new columns.

    CRM_Project_Meta shape (all text business codes, no cross-DB FKs):
        project_code  PK   -> Dim_Project.Project_Code
        owner_code         -> Dim_Employee.Employee_Code
        company_code       -> Dim_Company.code_company
        section_code       -> Dim_Section.section_code

    Business codes (not raw integer IDs) because a project created via
    staging may not have a warehouse integer ID yet, but its Project_Code is
    known immediately and survives the staging->warehouse transition.

    API compatibility: the frontend still sends integer owner_id/company_id.
    create_project/update_project accept EITHER owner_code/company_code/
    section_code (preferred) OR the legacy owner_id/company_id integers,
    resolving IDs -> codes before writing. Section has no legacy integer
    form — it's code-only.

  Task (Dim_Task + Fact_Log) — the actual FACT. Mirrors Deals exactly:
  create_pending_task() writes to staging (SA_Log, Talend loads it later),
  list/get reads from the warehouse (Fact_Log LEFT JOIN everything), a
  narrow update() corrects a few fields directly on Fact_Log, delete is
  split the same way Deals splits it (safe staging delete vs. destructive
  warehouse delete).

  Fact_Log is task × comment grain — the same ID_Task repeats once per
  comment. list_tasks() groups by task and aggregates comments into a
  `comments: []` array per task via json_agg, so the API returns one object
  per task, not one per comment row. Adding NEW comments is intentionally
  out of scope here — see the chat for why staging doesn't map cleanly onto
  "append a comment to an already-loaded task". Comments below are
  read-only, sourced from whatever's already been loaded.

  Section is intentionally not modeled anywhere in this file — per your
  call, it's dropped from both the Task and Project forms for v1.
"""

import os
import uuid
import psycopg2
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse

from db import get_warehouse_conn, release_warehouse_conn, get_staging_conn, release_staging_conn
from surveys.services import notify

# Staging schema for pending tasks — matches the "Projects" schema shown in
# your SA_Log screenshot. Adjust if the real schema name differs.
STAGING_SCHEMA = "Projects"

# Default tenant written to every new staging row. SA_Log has an
# organization_id column but nothing in scope so far tells us how a
# multi-tenant value should actually be chosen — hardcoding for now.
DEFAULT_ORG_ID = "org-1"



def _iso(value):
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _next_id(cur, table: str, pk_col: str) -> int:
    cur.execute(f'SELECT COALESCE(MAX("{pk_col}"), 0) + 1 AS next_id FROM public."{table}"')
    return cur.fetchone()["next_id"]


def _resolve_date_id(cur, date_value):
    """Look up Dim_Date.ID_Date for a plain 'YYYY-MM-DD' value. Dim_Date is
    assumed pre-populated for the relevant range (standard DW pattern) —
    this does NOT insert new date rows, unlike Deals' YYYYMMDD int-key
    approach. If the date isn't in the dimension yet, this raises rather
    than silently failing the update."""
    if not date_value:
        return None
    cur.execute('SELECT "ID_Date" FROM public."Dim_Date" WHERE "date_value" = %s', (date_value,))
    row = cur.fetchone()
    if row is None:
        raise ValueError(
            f"Date '{date_value}' not found in Dim_Date — is the date dimension "
            "populated for this range?"
        )
    return row["ID_Date"]


def _owner_id_to_code(cur, owner_id) -> str | None:
    """Resolve a Dim_Employee.ID_Employee integer to its Employee_Code.
    Used to accept the frontend's legacy integer owner_id and store the
    stable business code in CRM_Project_Meta instead."""
    if not owner_id:
        return None
    cur.execute('SELECT "Employee_Code" FROM public."Dim_Employee" WHERE "ID_Employee" = %s', (owner_id,))
    row = cur.fetchone()
    if row is None:
        raise ValueError(f"Owner id '{owner_id}' not found in Dim_Employee.")
    return row["Employee_Code"]


def _company_id_to_code(cur, company_id) -> str | None:
    """Resolve a Dim_Company.ID_Company integer to its code_company."""
    if not company_id:
        return None
    cur.execute('SELECT "code_company" FROM public."Dim_Company" WHERE "ID_Company" = %s', (company_id,))
    row = cur.fetchone()
    if row is None:
        raise ValueError(f"Company id '{company_id}' not found in Dim_Company.")
    return row["code_company"]


def _resolve_meta_codes(data: dict) -> dict:
    """Normalize whatever the caller sent into the three business codes
    CRM_Project_Meta stores. Prefers explicit *_code values; falls back to
    resolving legacy integer owner_id/company_id -> code via the warehouse.
    Section is code-only (no legacy integer form). Returns a dict with keys
    owner_code / company_code / section_code, any of which may be None.
    Only opens a warehouse connection if an integer id actually needs
    resolving."""
    owner_code   = data.get("owner_code")
    company_code = data.get("company_code")
    section_code = data.get("section_code")

    needs_owner   = owner_code   is None and data.get("owner_id")
    needs_company = company_code is None and data.get("company_id")

    if needs_owner or needs_company:
        conn = get_warehouse_conn()
        try:
            with conn.cursor() as cur:
                if needs_owner:
                    owner_code = _owner_id_to_code(cur, data.get("owner_id"))
                if needs_company:
                    company_code = _company_id_to_code(cur, data.get("company_id"))
        finally:
            release_warehouse_conn(conn)

    return {
        "owner_code":   owner_code   or None,
        "company_code": company_code or None,
        "section_code": section_code or None,
    }


def _get_project_meta_map(project_codes: set[str]) -> dict[str, dict]:
    """Cross-database merge, keyed by Project_Code. CRM_Project_Meta lives in
    staging and now stores business codes; the display names it needs
    (Dim_Employee.full_name, Dim_Company.company, Dim_Section.section_name)
    live in the warehouse — Postgres can't JOIN across two separate
    databases, so this does staging fetch + warehouse lookup + Python merge.

    Returns a dict keyed by project_code. Each value carries both the stored
    codes and the resolved display names (plus resolved integer ids, kept for
    backward-compatible API output the frontend still reads)."""
    codes = {c for c in project_codes if c}
    if not codes:
        return {}

    meta_by_code: dict[str, dict] = {}
    conn = get_staging_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT "project_code", "owner_code", "company_code", "section_code"
                FROM "{STAGING_SCHEMA}"."CRM_Project_Meta"
                WHERE "project_code" = ANY(%s)
            """, (list(codes),))
            for row in cur.fetchall():
                meta_by_code[row["project_code"]] = {
                    "owner_code":   row["owner_code"],
                    "company_code": row["company_code"],
                    "section_code": row["section_code"],
                }
    finally:
        release_staging_conn(conn)

    owner_codes   = {m["owner_code"]   for m in meta_by_code.values() if m["owner_code"]}
    company_codes = {m["company_code"] for m in meta_by_code.values() if m["company_code"]}
    section_codes = {m["section_code"] for m in meta_by_code.values() if m["section_code"]}

    employees, companies, sections = {}, {}, {}
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            if owner_codes:
                cur.execute(
                    'SELECT "ID_Employee", "Employee_Code", "full_name" '
                    'FROM public."Dim_Employee" WHERE "Employee_Code" = ANY(%s)',
                    (list(owner_codes),),
                )
                employees = {r["Employee_Code"]: r for r in cur.fetchall()}
            if company_codes:
                cur.execute(
                    'SELECT "ID_Company", "code_company", "company" '
                    'FROM public."Dim_Company" WHERE "code_company" = ANY(%s)',
                    (list(company_codes),),
                )
                companies = {r["code_company"]: r for r in cur.fetchall()}
            if section_codes:
                cur.execute(
                    'SELECT "section_code", "section_name" '
                    'FROM public."Dim_Section" WHERE "section_code" = ANY(%s)',
                    (list(section_codes),),
                )
                sections = {r["section_code"]: r for r in cur.fetchall()}
    finally:
        release_warehouse_conn(conn)

    result = {}
    for pcode, m in meta_by_code.items():
        emp = employees.get(m["owner_code"])   if m["owner_code"]   else None
        co  = companies.get(m["company_code"]) if m["company_code"] else None
        sec = sections.get(m["section_code"])  if m["section_code"] else None
        result[pcode] = {
            "owner_code":   m["owner_code"],
            "owner_id":     emp["ID_Employee"] if emp else None,
            "owner_name":   emp["full_name"]   if emp else None,
            "company_code": m["company_code"],
            "company_id":   co["ID_Company"]   if co else None,
            "company_name": co["company"]      if co else None,
            "section_code": m["section_code"],
            "section_name": sec["section_name"] if sec else None,
        }
    return result

# ── Add to projects/services.py ─────────────────────────────────────────────


def get_projects_stats() -> dict:
    """
    GET /api/projects/stats/ — KPI cards for the Projects page.

    Status values confirmed live from Dim_Project.status: 'active',
    'completed', 'on_hold' (lowercase snake_case).
    """
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT
                            COUNT(*)                                       AS total_projects,
                            COUNT(*) FILTER (WHERE "status" = 'completed') AS completed_count,
                            COUNT(*) FILTER (WHERE "status" = 'active')    AS active_count,
                            AVG(
                                    EXTRACT(EPOCH FROM ("end_date"::timestamp - "start_date"::timestamp)) / 86400.0
                            ) FILTER (
                                WHERE "start_date" IS NOT NULL AND "end_date" IS NOT NULL
                            )                                               AS avg_duration_days
                        FROM public."Dim_Project"
                        """)
            proj_row = cur.fetchone()

            cur.execute("""
                        SELECT
                            COUNT(DISTINCT "ID_Task")    AS total_tasks,
                            COUNT(DISTINCT "ID_Project") AS projects_with_tasks
                        FROM public."Fact_Log"
                        """)
            task_row = cur.fetchone()

            total     = int(proj_row["total_projects"])
            completed = int(proj_row["completed_count"])
            active    = int(proj_row["active_count"])
            avg_dur   = proj_row["avg_duration_days"]  # None-checked below, not cast blindly

            total_tasks         = int(task_row["total_tasks"])
            projects_with_tasks = int(task_row["projects_with_tasks"])

            return {
                "activeProjects":      active,
                "completedPct":        round(100 * completed / total, 1) if total else 0,
                "teamProductivityPct": round(100 * (completed + active) / total, 1) if total else 0,
                "avgDurationDays":     round(float(avg_dur)) if avg_dur is not None else None,
                "tasksPerProject":     round(total_tasks / projects_with_tasks) if projects_with_tasks else 0,
            }
    finally:
        release_warehouse_conn(conn)
# ── Project (Dim_Project) — direct warehouse CRUD, no staging ───────────────

def list_projects(filters: dict | None = None) -> list[dict]:
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            where_parts, params = [], []
            if filters and filters.get("status"):
                where_parts.append('p."status" ILIKE %s')
                params.append(f"%{filters['status']}%")
            where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

            cur.execute(f"""
                SELECT
                    p."ID_Project"   AS id, p."Project_Code" AS project_code,
                    p."Project_Name" AS project_name, p."Team_Name" AS team_name,
                    p."start_date", p."end_date", p."status", p."description"
                FROM public."Dim_Project" p
                {where_sql}
                ORDER BY p."Project_Name"
            """, params)
            rows = [dict(r) for r in cur.fetchall()]
    finally:
        release_warehouse_conn(conn)

    meta_map = _get_project_meta_map({r["project_code"] for r in rows})

    result = []
    for r in rows:
        m = meta_map.get(r["project_code"], {})
        r["start_date"] = _iso(r.get("start_date"))
        r["end_date"]   = _iso(r.get("end_date"))
        r["owner_id"]     = m.get("owner_id")
        r["owner_code"]   = m.get("owner_code")
        r["owner_name"]   = m.get("owner_name")
        r["company_id"]   = m.get("company_id")
        r["company_code"] = m.get("company_code")
        r["company_name"] = m.get("company_name")
        r["section_code"] = m.get("section_code")
        r["section_name"] = m.get("section_name")
        result.append(r)

    # owner_name/company_name filters run post-merge — they depend on the
    # cross-database lookup above, not on anything Dim_Project itself has.
    if filters:
        if filters.get("owner_name"):
            q = filters["owner_name"].lower()
            result = [r for r in result if r["owner_name"] and q in r["owner_name"].lower()]
        if filters.get("company_name"):
            q = filters["company_name"].lower()
            result = [r for r in result if r["company_name"] and q in r["company_name"].lower()]

    return result

def get_project(project_id: int) -> dict | None:
    for p in list_projects():
        if p["id"] == project_id:
            return p
    return None


def list_project_statuses() -> list[str]:
    """Distinct project statuses actually present in Dim_Project.status.

    Read live from the data (not a hardcoded list) so statuses introduced
    by Talend or any non-app writer still show up. Deduped case-insensitively
    on the lowercased/canonical form — so 'active', 'Active', 'ACTIVE' all
    collapse to a single 'active' — guarding against inconsistent casing
    from different writers. NULL/blank statuses are skipped. The frontend
    prettifies these canonical values for display."""
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT DISTINCT LOWER(TRIM("status")) AS status
                        FROM public."Dim_Project"
                        WHERE "status" IS NOT NULL AND TRIM("status") <> ''
                        ORDER BY status
                        """)
            return [r["status"] for r in cur.fetchall()]
    finally:
        release_warehouse_conn(conn)



def create_project(data: dict) -> dict:
    project_name = (data.get("project_name") or "").strip()
    if not project_name:
        raise ValueError("Project name is required.")

    warehouse = get_warehouse_conn()
    try:
        with warehouse.cursor() as cur:
            cur.execute(
                'SELECT "ID_Project" FROM public."Dim_Project" WHERE LOWER("Project_Name") = LOWER(%s)',
                (project_name,),
            )
            if cur.fetchone():
                raise ValueError(f"Project '{project_name}' already exists.")

            new_id = _next_id(cur, "Dim_Project", "ID_Project")
            project_code = f"PRJ-{new_id:04d}"

            cur.execute("""
                        INSERT INTO public."Dim_Project"
                        ("ID_Project", "Project_Code", "Project_Name", "Team_Name",
                         "start_date", "end_date", "status", "description")
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """, (
                            new_id, project_code, project_name, data.get("team_name") or None,
                            data.get("start_date") or None, data.get("end_date") or None,
                            data.get("status") or "Planning", data.get("description") or None,
                        ))
        warehouse.commit()
    except Exception:
        warehouse.rollback()
        raise
    finally:
        release_warehouse_conn(warehouse)

    # Owner/Company/Section live in a different database now (staging
    # CRM_Project_Meta), keyed by the project's business code — separate
    # write, no shared transaction with the Dim_Project insert above. If
    # this fails after the project was already created, the project just
    # ends up without meta and can be fixed via update_project — it doesn't
    # roll back the whole create.
    #
    # _resolve_meta_codes accepts either *_code values or legacy integer
    # owner_id/company_id (resolving ids -> codes). Its warehouse lookup
    # runs before we take the staging connection, so the two pools never
    # overlap.
    meta = _resolve_meta_codes(data)
    if meta["owner_code"] or meta["company_code"] or meta["section_code"]:
        staging = get_staging_conn()
        try:
            with staging.cursor() as cur:
                cur.execute(f"""
                    INSERT INTO "{STAGING_SCHEMA}"."CRM_Project_Meta"
                        ("project_code", "owner_code", "company_code", "section_code")
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT ("project_code") DO UPDATE SET
                        "owner_code"   = COALESCE(EXCLUDED."owner_code",   "CRM_Project_Meta"."owner_code"),
                        "company_code" = COALESCE(EXCLUDED."company_code", "CRM_Project_Meta"."company_code"),
                        "section_code" = COALESCE(EXCLUDED."section_code", "CRM_Project_Meta"."section_code"),
                        "updated_at"   = now()
                """, (project_code, meta["owner_code"], meta["company_code"], meta["section_code"]))
            staging.commit()
        except Exception:
            staging.rollback()
            raise
        finally:
            release_staging_conn(staging)

    notify(
        event_type="project_created",
        title=f"New project — {project_name}",
        body=(f"Project code {project_code} created"
              + (f" for {data.get('team_name')}" if data.get('team_name') else "")
              + "."),
        code_company=meta.get("company_code") or "",
        related_type="project", related_id=str(new_id),
    )

    return get_project(new_id)

def update_project(project_id: int, data: dict) -> dict:
    allowed = {"status", "start_date", "end_date", "description",
               "owner_id", "company_id", "owner_code", "company_code", "section_code"}
    provided = {k: v for k, v in data.items() if k in allowed}
    if not provided:
        raise ValueError("No editable fields provided.")

    dim_fields  = {k: v for k, v in provided.items() if k in ("status", "start_date", "end_date", "description")}
    has_meta    = any(k in provided for k in ("owner_id", "company_id", "owner_code", "company_code", "section_code"))

    # Resolve the project's business code once — needed both to key the meta
    # upsert and to confirm the project exists when there are no dim_fields.
    project_code = None
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "Project_Code" FROM public."Dim_Project" WHERE "ID_Project" = %s',
                (project_id,),
            )
            row = cur.fetchone()
            if row is None:
                raise ValueError(f"Project '{project_id}' not found.")
            project_code = row["Project_Code"]

            if dim_fields:
                col_map = {"status": '"status"', "start_date": '"start_date"',
                           "end_date": '"end_date"', "description": '"description"'}
                set_parts = [f"{col_map[k]} = %s" for k in dim_fields]
                cur.execute(f"""
                    UPDATE public."Dim_Project" SET {", ".join(set_parts)}
                    WHERE "ID_Project" = %s
                """, list(dim_fields.values()) + [project_id])
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_warehouse_conn(conn)

    if has_meta:
        # Resolve ids/codes -> codes BEFORE taking the staging connection so
        # the warehouse and staging pools never overlap.
        meta = _resolve_meta_codes(provided)
        conn = get_staging_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(f"""
                    INSERT INTO "{STAGING_SCHEMA}"."CRM_Project_Meta"
                        ("project_code", "owner_code", "company_code", "section_code")
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT ("project_code") DO UPDATE SET
                        "owner_code"   = COALESCE(EXCLUDED."owner_code",   "CRM_Project_Meta"."owner_code"),
                        "company_code" = COALESCE(EXCLUDED."company_code", "CRM_Project_Meta"."company_code"),
                        "section_code" = COALESCE(EXCLUDED."section_code", "CRM_Project_Meta"."section_code"),
                        "updated_at"   = now()
                """, (project_code, meta["owner_code"], meta["company_code"], meta["section_code"]))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            release_staging_conn(conn)  # ← fixed: was release_warehouse_conn (wrong pool)

    return get_project(project_id)

# ── Task (Dim_Task + Fact_Log) — staging create, warehouse read/correct ────

def list_tasks(filters: dict | None = None) -> list[dict]:
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            where_parts, params = [], []
            if filters:
                if filters.get("project_id"):
                    where_parts.append('p."ID_Project" = %s')
                    params.append(filters["project_id"])
                if filters.get("tag_name"):
                    where_parts.append('tg."name" ILIKE %s')
                    params.append(f"%{filters['tag_name']}%")
                if filters.get("completed") is not None:
                    where_parts.append('f."completed" = %s')
                    params.append(filters["completed"] in (True, "true", "True", "1"))
            where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

            cur.execute(f"""
                SELECT
                    t."ID_Task"       AS id,
                    t."task_code",
                    t."Task_name"     AS name,
                    t."Task_type"     AS task_type,
                    t."description",
                    p."ID_Project"    AS project_id,
                    p."Project_Code"  AS project_code,
                    p."Project_Name"  AS project_name,
                    tg."ID_Tag"       AS tag_id,
                    tg."name"         AS tag_name,
                    tg."color"        AS tag_color,
                    sd."date_value"   AS start_date,
                    dd."date_value"   AS due_date,
                    ed."date_value"   AS end_date,
                    bool_or(f."completed") AS completed,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'id', cm."ID_Comment", 'content', cm."content",
                                'full_name', cm."full_name", 'created_at', cm."created_at"
                            ) ORDER BY cm."created_at"
                        ) FILTER (WHERE cm."ID_Comment" IS NOT NULL),
                        '[]'
                    ) AS comments
                FROM        public."Fact_Log" f
                JOIN        public."Dim_Task"    t  ON f."ID_Task"       = t."ID_Task"
                LEFT JOIN   public."Dim_Project" p  ON f."ID_Project"    = p."ID_Project"
                LEFT JOIN   public."Dim_Tag"     tg ON f."ID_Tag"        = tg."ID_Tag"
                LEFT JOIN   public."Dim_Date"    sd ON f."ID_Start_Date" = sd."ID_Date"
                LEFT JOIN   public."Dim_Date"    dd ON f."ID_Due_Date"   = dd."ID_Date"
                LEFT JOIN   public."Dim_Date"    ed ON f."ID_End_Date"   = ed."ID_Date"
                LEFT JOIN   public."Dim_Comment" cm ON f."ID_Comment"    = cm."ID_Comment"
                {where_sql}
                GROUP BY t."ID_Task", t."task_code", t."Task_name", t."Task_type", t."description",
                         p."ID_Project", p."Project_Code", p."Project_Name", tg."ID_Tag", tg."name", tg."color",
                         sd."date_value", dd."date_value", ed."date_value"
                ORDER BY dd."date_value" DESC NULLS LAST
            """, params)
            rows = [dict(r) for r in cur.fetchall()]
    finally:
        release_warehouse_conn(conn)

    # Owner/Company resolved through the project, cross-database — see
    # _get_project_meta_map. Fact_Log's own ID_Owner/ID_Company (whatever
    # Talend does or doesn't put there) is still deliberately never read.
    meta_map = _get_project_meta_map({r["project_code"] for r in rows if r["project_code"]})

    result = []
    for d in rows:
        d["start_date"] = _iso(d.get("start_date"))
        d["due_date"] = _iso(d.get("due_date"))
        d["end_date"] = _iso(d.get("end_date"))
        m = meta_map.get(d["project_code"], {})
        d["owner_id"]     = m.get("owner_id")
        d["owner_code"]   = m.get("owner_code")
        d["owner_name"]   = m.get("owner_name")
        d["company_id"]   = m.get("company_id")
        d["company_code"] = m.get("company_code")
        d["company_name"] = m.get("company_name")
        d["section_code"] = m.get("section_code")
        d["section_name"] = m.get("section_name")
        for cm in d.get("comments") or []:
            ca = cm.get("created_at")
            cm["created_at"] = _iso(ca) if hasattr(ca, "isoformat") else ca
        result.append(d)
    return result

def get_task(task_id: int) -> dict | None:
    for t in list_tasks():
        if t["id"] == task_id:
            return t
    return None


def create_pending_task(data: dict) -> dict:
    """Writes a new task to SA_Log staging. Talend loads it into
    Fact_Log/Dim_Task later — same lifecycle as Deals' create_pending_deal.
    Owner/company are NOT set here — they live on the Project and are
    expected to be resolved/propagated by the ETL from project_id."""
    required = ["name", "project_id", "project_name"]
    for field in required:
        if not data.get(field):
            raise ValueError(f"Missing required field: {field}")

    task_id = uuid.uuid4().hex[:8].upper()

    conn = get_staging_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO "{STAGING_SCHEMA}"."SA_Log" (
                    id, name, description,
                    project_id, project_name,
                    organization_id,
                    tag_id, tag_name,
                    due_date, completed
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                task_id,
                data["name"],
                data.get("description") or None,
                data["project_id"],
                data["project_name"],
                DEFAULT_ORG_ID,
                data.get("tag_id") or None,
                data.get("tag_name") or None,
                data.get("due_date") or None,
                False,
            ))
        conn.commit()

        notify(
            event_type="task_created",
            title=f"New task — {data['name']}",
            body=f"Added to {data['project_name']}.",
            related_type="task", related_id=task_id,
        )

        return {"success": True, "id": task_id}
    except Exception:
        conn.rollback()
        raise
    finally:
        release_staging_conn(conn)



def update_task(task_id: int, data: dict) -> dict:
    """Narrow correction on the warehouse — tag, completed, due_date,
    end_date. Because Fact_Log is task×comment grain, this updates every
    row sharing this ID_Task so the change stays consistent across all of
    a task's comment rows. Owner/company/project are NOT editable here —
    re-resolving those means editing the Project instead."""
    allowed = {"tag_id", "completed", "due_date", "end_date"}
    provided = {k: v for k, v in data.items() if k in allowed}
    if not provided:
        raise ValueError("Only tag_id, completed, due_date, and end_date can be edited.")

    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT 1 FROM public."Fact_Log" WHERE "ID_Task" = %s LIMIT 1', (task_id,))
            if cur.fetchone() is None:
                raise ValueError(f"Task '{task_id}' not found.")

            set_parts, values = [], []
            if "tag_id" in provided:
                set_parts.append('"ID_Tag" = %s')
                values.append(provided["tag_id"])
            if "completed" in provided:
                set_parts.append('"completed" = %s')
                values.append(bool(provided["completed"]))
            if "due_date" in provided:
                set_parts.append('"ID_Due_Date" = %s')
                values.append(_resolve_date_id(cur, provided["due_date"]))
            if "end_date" in provided:
                set_parts.append('"ID_End_Date" = %s')
                values.append(_resolve_date_id(cur, provided["end_date"]))

            cur.execute(f"""
                UPDATE public."Fact_Log"
                SET {", ".join(set_parts)}
                WHERE "ID_Task" = %s
            """, values + [task_id])
        conn.commit()
        return get_task(task_id)
    except Exception:
        conn.rollback()
        raise
    finally:
        release_warehouse_conn(conn)


def delete_pending_task(task_id: str) -> None:
    """Safe delete — removes a not-yet-loaded task from the staging queue."""
    conn = get_staging_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f'DELETE FROM "{STAGING_SCHEMA}"."SA_Log" WHERE id = %s', (task_id,))
            if cur.rowcount == 0:
                raise ValueError(f"Pending task '{task_id}' not found in staging queue.")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_staging_conn(conn)


def delete_historical_task(task_id: int) -> None:
    """⚠️ DESTRUCTIVE — removes every Fact_Log row for this task (all its
    comment rows), same risk profile as Deals' delete_warehouse_deal.
    Dim_Task/Dim_Comment rows are left in place — nothing else references
    them once the Fact_Log rows are gone, but they're not cleaned up here."""
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute('DELETE FROM public."Fact_Log" WHERE "ID_Task" = %s', (task_id,))
            if cur.rowcount == 0:
                raise ValueError(f"Task '{task_id}' not found in the warehouse.")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_warehouse_conn(conn)