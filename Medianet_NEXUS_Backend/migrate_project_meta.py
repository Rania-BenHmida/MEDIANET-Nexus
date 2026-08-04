"""
migrate_project_meta.py

Backfills CRM_Project_Meta by reading distinct projects straight out of
SA_Log (staging) — the old CRM_Project_Meta_old table is gone, so SA_Log
is the only real data source left.

For each distinct project found:
  - Looks up (or creates) a matching Dim_Project row by name → Project_Code
  - Looks up (or creates) a matching Dim_Employee row by owner name → Employee_Code
  - Looks up (or creates) a matching Dim_Section row by section name → section_code
  - Upserts one row into CRM_Project_Meta keyed by project_code

company_code is taken directly from SA_Log.organization_id — that column
is already the same business key as Dim_Company.code_company, so there's
nothing to resolve or create here (unlike project/owner/section). It's
passed through as-is. Right now SA_Log only carries the placeholder
"org-1" for every row, so every CRM_Project_Meta row will get that same
company_code until real org data lands in SA_Log. Mapping company_code
to a company name for display (e.g. project list) should happen at
read-time via a lookup against Dim_Company.

Safe to re-run — everything upserts/dedupes by name or code.
Run: python migrate_project_meta.py
"""

import uuid
from db import get_warehouse_conn, release_warehouse_conn, get_staging_conn, release_staging_conn

STAGING_SCHEMA = "Projects"


def _next_id(cur, table: str, pk_col: str) -> int:
    cur.execute(f'SELECT COALESCE(MAX("{pk_col}"), 0) + 1 AS next_id FROM public."{table}"')
    return cur.fetchone()["next_id"]


def fetch_source_rows() -> list[dict]:
    """One row per distinct project out of SA_Log. Owner/section/org are
    supposed to be identical across every row for the same project
    (inherited), so DISTINCT ON just needs any one representative row."""
    conn = get_staging_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT DISTINCT ON (project_name)
                    project_name, owner_name, section_name, organization_id
                FROM "{STAGING_SCHEMA}"."SA_Log"
                WHERE project_name IS NOT NULL
            """)
            return cur.fetchall()
    finally:
        release_staging_conn(conn)


def resolve_project_codes(project_names: set[str]) -> dict[str, str]:
    """Returns {project_name: project_code}, creating any Dim_Project row
    that doesn't already exist (matched case-insensitively by name)."""
    if not project_names:
        return {}

    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "Project_Name", "Project_Code" FROM public."Dim_Project" '
                'WHERE "Project_Name" = ANY(%s)',
                (list(project_names),),
            )
            codes = {r["Project_Name"]: r["Project_Code"] for r in cur.fetchall()}

            missing = [n for n in project_names if n not in codes]
            for name in missing:
                new_id = _next_id(cur, "Dim_Project", "ID_Project")
                project_code = f"PRJ-{new_id:04d}"
                cur.execute(
                    """
                    INSERT INTO public."Dim_Project"
                        ("ID_Project", "Project_Code", "Project_Name")
                    VALUES (%s, %s, %s)
                    """,
                    (new_id, project_code, name),
                )
                codes[name] = project_code

            if missing:
                print(f"  Created {len(missing)} new Dim_Project row(s): {missing}")
        conn.commit()
        return codes
    except Exception:
        conn.rollback()
        raise
    finally:
        release_warehouse_conn(conn)


def resolve_owner_codes(owner_names: set[str]) -> dict[str, str]:
    """Returns {owner_name: employee_code}, creating any Dim_Employee row
    that doesn't already exist (matched case-insensitively by full_name)."""
    if not owner_names:
        return {}

    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "full_name", "Employee_Code" FROM public."Dim_Employee" '
                'WHERE "full_name" = ANY(%s)',
                (list(owner_names),),
            )
            codes = {r["full_name"]: r["Employee_Code"] for r in cur.fetchall()}

            missing = [n for n in owner_names if n not in codes]
            for name in missing:
                new_id = _next_id(cur, "Dim_Employee", "ID_Employee")
                employee_code = f"EMP-{new_id:04d}"
                cur.execute(
                    """
                    INSERT INTO public."Dim_Employee"
                        ("ID_Employee", "Employee_Code", "full_name", "name", "joined_at")
                    VALUES (%s, %s, %s, %s, now())
                    """,
                    (new_id, employee_code, name, name),
                )
                codes[name] = employee_code

            if missing:
                print(f"  Created {len(missing)} new Dim_Employee row(s): {missing}")
        conn.commit()
        return codes
    except Exception:
        conn.rollback()
        raise
    finally:
        release_warehouse_conn(conn)


def resolve_section_codes(section_names: set[str]) -> dict[str, str]:
    """Returns {section_name: section_code}, creating any Dim_Section row
    that doesn't already exist (matched case-insensitively by name).
    section_code is a UUID, matching the existing Dim_Section convention."""
    if not section_names:
        return {}

    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "section_name", "section_code" FROM public."Dim_Section" '
                'WHERE "section_name" = ANY(%s)',
                (list(section_names),),
            )
            codes = {r["section_name"]: r["section_code"] for r in cur.fetchall()}

            missing = [n for n in section_names if n not in codes]
            for name in missing:
                new_id = _next_id(cur, "Dim_Section", "ID_Section")
                section_code = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO public."Dim_Section"
                        ("ID_Section", "section_code", "section_name")
                    VALUES (%s, %s, %s)
                    """,
                    (new_id, section_code, name),
                )
                codes[name] = section_code

            if missing:
                print(f"  Created {len(missing)} new Dim_Section row(s): {missing}")
        conn.commit()
        return codes
    except Exception:
        conn.rollback()
        raise
    finally:
        release_warehouse_conn(conn)


def upsert_project_meta(rows: list[dict], project_codes, owner_codes, section_codes) -> int:
    conn = get_staging_conn()
    written = 0
    try:
        with conn.cursor() as cur:
            for row in rows:
                project_code = project_codes.get(row["project_name"])
                if not project_code:
                    continue  # shouldn't happen — resolve_project_codes covers every name

                owner_code   = owner_codes.get(row["owner_name"])     if row["owner_name"]   else None
                section_code = section_codes.get(row["section_name"]) if row["section_name"] else None
                # organization_id is already the business key — same
                # value Dim_Company.code_company uses — so pass it
                # straight through with no lookup/creation step.
                company_code = row["organization_id"] if row["organization_id"] else None

                cur.execute(f"""
                    INSERT INTO "{STAGING_SCHEMA}"."CRM_Project_Meta"
                        ("project_code", "owner_code", "company_code", "section_code")
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT ("project_code") DO UPDATE SET
                        "owner_code"   = COALESCE(EXCLUDED."owner_code",   "CRM_Project_Meta"."owner_code"),
                        "company_code" = COALESCE(EXCLUDED."company_code", "CRM_Project_Meta"."company_code"),
                        "section_code" = COALESCE(EXCLUDED."section_code", "CRM_Project_Meta"."section_code"),
                        "updated_at"   = now()
                """, (project_code, owner_code, company_code, section_code))
                written += 1
        conn.commit()
        return written
    except Exception:
        conn.rollback()
        raise
    finally:
        release_staging_conn(conn)


def migrate():
    rows = fetch_source_rows()
    if not rows:
        print("No projects found in SA_Log — nothing to migrate.")
        return

    print(f"Found {len(rows)} distinct project(s) in SA_Log.")

    project_names = {r["project_name"] for r in rows}
    owner_names   = {r["owner_name"]   for r in rows if r["owner_name"]}
    section_names = {r["section_name"] for r in rows if r["section_name"]}

    print("Resolving project codes...")
    project_codes = resolve_project_codes(project_names)

    print("Resolving owner codes...")
    owner_codes = resolve_owner_codes(owner_names)

    print("Resolving section codes...")
    section_codes = resolve_section_codes(section_names)

    print("Writing CRM_Project_Meta...")
    written = upsert_project_meta(rows, project_codes, owner_codes, section_codes)

    print(f"Done. {written} row(s) written to CRM_Project_Meta.")
    print("Note: company_code is copied straight from SA_Log.organization_id (no Dim_Company lookup performed).")


if __name__ == "__main__":
    migrate()