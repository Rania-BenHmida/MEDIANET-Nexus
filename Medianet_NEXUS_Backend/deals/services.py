import os
import psycopg2
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse

from db import get_warehouse_conn, release_warehouse_conn, get_staging_conn, release_staging_conn


# ── Date-key helpers ──────────────────────────────────────────────────────────
#
# Fact_Opportunity stores dates as integer surrogate keys in YYYYMMDD format
# (e.g. 20161020), NOT native SQL date/timestamp columns. They must be parsed
# manually and can be NULL (see ID_Close_Date on open/unclosed deals).

def _datekey_to_iso(value) -> str | None:
    """Convert an integer date-key like 20161020 to '2016-10-20'. None-safe."""
    if value is None:
        return None
    s = str(value)
    if len(s) != 8 or not s.isdigit():
        return None
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"


def _iso(value):
    """Return an ISO-8601 string for a native date/datetime, or None."""
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


# ── Stats (warehouse) ─────────────────────────────────────────────────────────

def get_deals_stats() -> dict:
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        WITH
                            all_deals AS (
                                SELECT COALESCE(SUM(o."close_value"), 0) AS total_pipeline_value
                                FROM public."Fact_Opportunity" o
                            ),
                            open_deals AS (
                                SELECT COUNT(*) AS open_count
                                FROM public."Fact_Opportunity" o
                                         JOIN public."Dim_Stage" s ON o."ID_Stage" = s."ID_Stage"
                                WHERE s."Is_Closed" = false
                            ),
                            closed_deals AS (
                                SELECT COALESCE(AVG(CASE WHEN s."Is_Won" THEN o."close_value" END), 0) AS avg_won_value
                                FROM public."Fact_Opportunity" o
                                         JOIN public."Dim_Stage" s ON o."ID_Stage" = s."ID_Stage"
                                WHERE s."Is_Closed" = true
                            ),
                            win_rate AS (
                                SELECT
                                    CASE WHEN COUNT(*) > 0
                                             THEN SUM(CASE WHEN s."Is_Won" THEN 1 ELSE 0 END) * 100.0 / COUNT(*)
                                         ELSE 0
                                        END AS win_rate
                                FROM public."Fact_Opportunity" o
                                         JOIN public."Dim_Stage" s ON o."ID_Stage" = s."ID_Stage"
                                WHERE s."Is_Closed" = true
                            ),
                            unique_clients AS (
                                SELECT COUNT(DISTINCT o."ID_Company") AS unique_companies
                                FROM public."Fact_Opportunity" o
                            )
                        SELECT
                            all_deals.total_pipeline_value,
                            open_deals.open_count,
                            closed_deals.avg_won_value,
                            win_rate.win_rate,
                            unique_clients.unique_companies
                        FROM all_deals, open_deals, closed_deals, win_rate, unique_clients
                        """)
            row = cur.fetchone()
            return {
                "pipelineValue":            float(row["total_pipeline_value"]),
                "openDeals":                int(row["open_count"]),
                "avgCustomerLifetimeValue": float(row["avg_won_value"]),
                "winRate":                  round(float(row["win_rate"]), 1),
                "uniqueClients":            int(row["unique_companies"]),
                "pipelineValueChange":      0,
                "winRateChange":            0,
            }
    finally:
        release_warehouse_conn(conn)


# ── List — warehouse, read-only ───────────────────────────────────────────────
#
# Joins Fact_Opportunity with all four dimension tables so the API returns
# human-readable names instead of surrogate integer keys.
#
# Optional ILIKE filters: agent_name, company_name, stage_name, plan_name,
# is_closed (true/false string), is_won (true/false string),
# stage_group ('Open' or 'Closed' — exact match on Dim_Stage.Stage_Group).

def list_deals(filters: dict | None = None) -> list[dict]:
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            where_parts = []
            params = []

            if filters:
                if filters.get("agent_name"):
                    where_parts.append('a."Agent_FullName" ILIKE %s')
                    params.append(f"%{filters['agent_name']}%")
                if filters.get("company_name"):
                    where_parts.append('c."company" ILIKE %s')
                    params.append(f"%{filters['company_name']}%")
                if filters.get("stage_name"):
                    where_parts.append('s."Stage_Name" ILIKE %s')
                    params.append(f"%{filters['stage_name']}%")
                if filters.get("plan_name"):
                    where_parts.append('p."plan_name" ILIKE %s')
                    params.append(f"%{filters['plan_name']}%")
                if filters.get("is_closed") is not None:
                    where_parts.append('s."Is_Closed" = %s')
                    params.append(filters["is_closed"] in (True, "true", "True", "1"))
                if filters.get("is_won") is not None:
                    where_parts.append('s."Is_Won" = %s')
                    params.append(filters["is_won"] in (True, "true", "True", "1"))
                if filters.get("stage_group"):
                    # Exact match — Dim_Stage.Stage_Group is 'Open' or 'Closed'
                    where_parts.append('s."Stage_Group" = %s')
                    params.append(filters["stage_group"])

            where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

            # LEFT JOINs (not INNER) — ID_Company, ID_Close_Date, close_value
            # can all be NULL on real rows (see opportunity #10). An INNER
            # JOIN on Dim_Company would silently drop those deals from the
            # list entirely, which is data loss, not filtering.
            cur.execute(f"""
                SELECT
                    o."ID_Opportunity"   AS id,
                    a."Agent_FullName"   AS agent_name,
                    p."plan_name"        AS plan_name,
                    c."company"          AS company_name,
                    s."Stage_Name"       AS stage_name,
                    s."Is_Closed"        AS is_closed,
                    s."Is_Won"           AS is_won,
                    s."Stage_Group"      AS stage_group,
                    o."ID_Engage_Date"   AS engage_date_key,
                    o."ID_Close_Date"    AS close_date_key,
                    o."close_value"
                FROM        public."Fact_Opportunity" o
                LEFT JOIN   public."Dim_Agent"   a ON o."ID_Agent"   = a."ID_Agent"
                LEFT JOIN   public."Dim_Plan"    p ON o."ID_Plan"    = p."ID_Plan"
                LEFT JOIN   public."Dim_Company" c ON o."ID_Company" = c."ID_Company"
                LEFT JOIN   public."Dim_Stage"   s ON o."ID_Stage"   = s."ID_Stage"
                {where_sql}
                ORDER BY o."ID_Engage_Date" DESC NULLS LAST
            """, params)

            rows = cur.fetchall()
            result = []
            for row in rows:
                d = dict(row)
                d["engage_date"] = _datekey_to_iso(d.pop("engage_date_key"))
                d["close_date"]  = _datekey_to_iso(d.pop("close_date_key"))
                if d.get("close_value") is not None:
                    d["close_value"] = float(d["close_value"])
                result.append(d)
            return result
    finally:
        release_warehouse_conn(conn)


# ── List — convenience wrappers for Open / Closed deal tables ────────────────

def list_open_deals(filters: dict | None = None) -> list[dict]:
    """Deals where Dim_Stage.Stage_Group = 'Open' (e.g. Prospecting, Engaging, Qualification)."""
    merged = dict(filters or {})
    merged["stage_group"] = "Open"
    return list_deals(merged)


def list_closed_deals(filters: dict | None = None) -> list[dict]:
    """Deals where Dim_Stage.Stage_Group = 'Closed' (e.g. Won, Lost)."""
    merged = dict(filters or {})
    merged["stage_group"] = "Closed"
    return list_deals(merged)


# ── Get single — warehouse, read-only ────────────────────────────────────────

def get_deal(opportunity_id: int) -> dict | None:
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT
                            o."ID_Opportunity"   AS id,
                            a."Agent_FullName"   AS agent_name,
                            p."plan_name"        AS plan_name,
                            c."company"          AS company_name,
                            s."Stage_Name"       AS stage_name,
                            s."Is_Closed"        AS is_closed,
                            s."Is_Won"           AS is_won,
                            o."ID_Engage_Date"   AS engage_date_key,
                            o."ID_Close_Date"    AS close_date_key,
                            o."close_value"
                        FROM        public."Fact_Opportunity" o
                                        LEFT JOIN   public."Dim_Agent"   a ON o."ID_Agent"   = a."ID_Agent"
                                        LEFT JOIN   public."Dim_Plan"    p ON o."ID_Plan"    = p."ID_Plan"
                                        LEFT JOIN   public."Dim_Company" c ON o."ID_Company" = c."ID_Company"
                                        LEFT JOIN   public."Dim_Stage"   s ON o."ID_Stage"   = s."ID_Stage"
                        WHERE o."ID_Opportunity" = %s
                        """, (opportunity_id,))
            row = cur.fetchone()
            if row is None:
                return None
            d = dict(row)
            d["engage_date"] = _datekey_to_iso(d.pop("engage_date_key"))
            d["close_date"]  = _datekey_to_iso(d.pop("close_date_key"))
            if d.get("close_value") is not None:
                d["close_value"] = float(d["close_value"])
            return d
    finally:
        release_warehouse_conn(conn)


# ── Update — warehouse, CLOSED deals only ────────────────────────────────────
#
# Closed (Won/Lost) deals can have their close_value and/or close_date
# corrected directly in Fact_Opportunity — e.g. fixing a typo'd amount.
# This is intentionally narrow: only these two scalar columns are writable.
# Agent/company/plan/stage are NOT editable here, since changing them would
# mean re-resolving Dim_* foreign keys, which is a much bigger and riskier
# operation than correcting a number. Open deals cannot be edited at all
# through this function — only deleted (see delete_warehouse_deal).
#
# close_date, if provided, must be an integer date-key (YYYYMMDD) or an
# ISO 'YYYY-MM-DD' string — both are normalised to the date-key format
# Fact_Opportunity expects.

def _iso_to_datekey(value) -> int | None:
    """Convert 'YYYY-MM-DD' or an int/str date-key to an int YYYYMMDD. None-safe."""
    if value is None or value == "":
        return None
    s = str(value)
    if "-" in s:
        s = s.replace("-", "")
    if len(s) != 8 or not s.isdigit():
        raise ValueError(f"Invalid date '{value}' — expected YYYY-MM-DD or YYYYMMDD.")
    return int(s)


def update_closed_deal(opportunity_id: int, data: dict) -> dict:
    allowed = {"close_value", "close_date"}
    provided = {k: v for k, v in data.items() if k in allowed}
    if not provided:
        raise ValueError("Only close_value and close_date can be edited on a closed deal.")

    set_parts = []
    values = []

    if "close_value" in provided:
        set_parts.append('"close_value" = %s')
        values.append(int(provided["close_value"]) if provided["close_value"] is not None else None)

    if "close_date" in provided:
        set_parts.append('"ID_Close_Date" = %s')
        values.append(_iso_to_datekey(provided["close_date"]))

    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            # Guard: only allow this on deals whose stage is actually Closed.
            # Prevents accidentally editing an Open deal through this path.
            cur.execute("""
                        SELECT s."Stage_Group"
                        FROM public."Fact_Opportunity" o
                                 JOIN public."Dim_Stage" s ON o."ID_Stage" = s."ID_Stage"
                        WHERE o."ID_Opportunity" = %s
                        """, (opportunity_id,))
            row = cur.fetchone()
            if row is None:
                raise ValueError(f"Deal '{opportunity_id}' not found.")
            if row["Stage_Group"] != "Closed":
                raise ValueError(
                    f"Deal '{opportunity_id}' is not Closed — only closed deals "
                    "(Won/Lost) can be edited."
                )

            cur.execute(f"""
                UPDATE public."Fact_Opportunity"
                SET {", ".join(set_parts)}
                WHERE "ID_Opportunity" = %s
            """, values + [opportunity_id])
        conn.commit()
        return get_deal(opportunity_id)
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_warehouse_conn(conn)

# ── Update — warehouse, OPEN deals only ──────────────────────────────────────
#
# Open (not-yet-closed) deals can have their stage, close_value, and
# close_date edited directly in Fact_Opportunity. This is broader than the
# closed-deal correction above because an open deal is still actively being
# worked: moving it to a later stage (or even straight to Won/Lost) is a
# normal part of managing the pipeline, not a "correction."
#
# stage_name, if provided, is resolved to Dim_Stage.ID_Stage. If the chosen
# stage belongs to the 'Closed' group, the deal effectively becomes closed
# as a result of this edit — that's intentional (e.g. marking a deal Won
# right from this screen) rather than an error.
#
# Agent/company/plan are still NOT editable here — re-resolving those Dim_*
# foreign keys is a bigger, riskier operation than updating stage/value/date.

def update_open_deal(opportunity_id: int, data: dict) -> dict:
    allowed = {"stage_name", "close_value", "close_date"}
    provided = {k: v for k, v in data.items() if k in allowed}
    if not provided:
        raise ValueError("Only stage_name, close_value, and close_date can be edited on an open deal.")

    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            # Guard: only allow this on deals whose stage is actually Open.
            # Closed deals go through update_closed_deal instead.
            cur.execute("""
                        SELECT s."Stage_Group"
                        FROM public."Fact_Opportunity" o
                                 JOIN public."Dim_Stage" s ON o."ID_Stage" = s."ID_Stage"
                        WHERE o."ID_Opportunity" = %s
                        """, (opportunity_id,))
            row = cur.fetchone()
            if row is None:
                raise ValueError(f"Deal '{opportunity_id}' not found.")
            if row["Stage_Group"] != "Open":
                raise ValueError(
                    f"Deal '{opportunity_id}' is not Open — only open deals "
                    "can be edited through this endpoint."
                )

            set_parts = []
            values = []

            if "stage_name" in provided:
                stage_name = (provided["stage_name"] or "").strip()
                if not stage_name:
                    raise ValueError("Stage name cannot be empty.")
                cur.execute(
                    'SELECT "ID_Stage" FROM public."Dim_Stage" WHERE LOWER("Stage_Name") = LOWER(%s)',
                    (stage_name,),
                )
                stage_row = cur.fetchone()
                if stage_row is None:
                    raise ValueError(f"Stage '{stage_name}' does not exist.")
                set_parts.append('"ID_Stage" = %s')
                values.append(stage_row["ID_Stage"])

            if "close_value" in provided:
                set_parts.append('"close_value" = %s')
                values.append(int(provided["close_value"]) if provided["close_value"] is not None else None)

            if "close_date" in provided:
                set_parts.append('"ID_Close_Date" = %s')
                values.append(_iso_to_datekey(provided["close_date"]))

            cur.execute(f"""
                UPDATE public."Fact_Opportunity"
                SET {", ".join(set_parts)}
                WHERE "ID_Opportunity" = %s
            """, values + [opportunity_id])
        conn.commit()
        return get_deal(opportunity_id)
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_warehouse_conn(conn)
#
# Writes a new pending deal to SA_Pipeline.
# opportunity_id is NOT generated by the app — it's already handled on the
# database side (default/sequence/trigger), matching the existing short
# alphanumeric codes like '00017AO'. We just insert the business fields and
# read back whatever ID the DB assigned via RETURNING.
#
# Talend later picks up pending rows and loads them into Fact_Opportunity.

import uuid

def create_pending_deal(data: dict) -> dict:
    required = ["agent_name", "plan_name", "company_name", "stage_name", "engage_date"]
    for field in required:
        if not data.get(field):
            raise ValueError(f"Missing required field: {field}")

    # Generate a short alphanumeric ID matching the existing format (e.g. '00017AO')
    # Using uuid4 hex shortened to 8 chars is safe enough for a staging queue
    opportunity_id = uuid.uuid4().hex[:8].upper()

    conn = get_staging_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        INSERT INTO "Deals"."SA_Pipeline" (
                            opportunity_id,
                            sales_agent,
                            product,
                            account,
                            deal_stage,
                            engage_date,
                            close_date,
                            close_value
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """, (
                            opportunity_id,
                            data["agent_name"],
                            data["plan_name"],
                            data["company_name"],
                            data["stage_name"],
                            data["engage_date"],
                            data.get("close_date") or None,
                            int(data["close_value"]) if data.get("close_value") else None,
                        ))
        conn.commit()
        return {"success": True, "id": opportunity_id}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_staging_conn(conn)

# ── Update — staging only ─────────────────────────────────────────────────────
#
# Only pending rows in SA_Pipeline can be edited — the warehouse is read-only.
# The caller must pass the staging opportunity_id (the short alphanumeric
# code, e.g. '00017AO' — DB-assigned, not a UUID), not the warehouse
# integer ID_Opportunity.

def update_pending_deal(opportunity_id: str, data: dict) -> dict:
    # Map API field names → SA_Pipeline column names
    col_map = {
        "agent_name":   "sales_agent",
        "plan_name":    "product",
        "company_name": "account",
        "stage_name":   "deal_stage",
        "engage_date":  "engage_date",
        "close_date":   "close_date",
        "close_value":  "close_value",
        "status":       "status",
    }

    updates = {col_map[k]: v for k, v in data.items() if k in col_map}
    if not updates:
        raise ValueError("No valid fields provided for update.")

    set_clause = ", ".join(f'"{col}" = %s' for col in updates)
    values     = list(updates.values()) + [opportunity_id]

    conn = get_staging_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                UPDATE "Deals"."SA_Pipeline"
                SET {set_clause}
                WHERE opportunity_id = %s
            """, values)
            if cur.rowcount == 0:
                raise ValueError(
                    f"Pending deal '{opportunity_id}' not found in staging queue. "
                    "Only pending (not-yet-loaded) deals can be edited."
                )
        conn.commit()

        # Return the updated staging row so the UI can reflect the change
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT
                            opportunity_id  AS id,
                            sales_agent     AS agent_name,
                            product         AS plan_name,
                            account         AS company_name,
                            deal_stage      AS stage_name,
                            engage_date,
                            close_date,
                            close_value,
                            status,
                            created_at
                        FROM "Deals"."SA_Pipeline"
                        WHERE opportunity_id = %s
                        """, (opportunity_id,))
            row = cur.fetchone()
            d = dict(row)
            d["engage_date"] = _iso(d.get("engage_date"))
            d["close_date"]  = _iso(d.get("close_date"))
            d["created_at"]  = _iso(d.get("created_at"))
            if d.get("close_value") is not None:
                d["close_value"] = float(d["close_value"])
            return d
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_staging_conn(conn)


# ── Delete — staging (pending deal) ───────────────────────────────────────────

def delete_pending_deal(opportunity_id: str) -> None:
    """
    Deletes a row from SA_Pipeline (staging).
    Safe: not yet loaded into the warehouse, no FK/reporting impact,
    fully recoverable by re-creating the deal.
    """
    conn = get_staging_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        DELETE FROM "Deals"."SA_Pipeline"
                        WHERE opportunity_id = %s
                        """, (opportunity_id,))
            if cur.rowcount == 0:
                raise ValueError(
                    f"Pending deal '{opportunity_id}' not found in staging queue."
                )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_staging_conn(conn)


# ── Delete — warehouse (historical deal) ─────────────────────────────────────
#
# ⚠️  DESTRUCTIVE — HARD DELETE FROM THE WAREHOUSE  ⚠️
#
# This permanently removes a row from Fact_Opportunity. Unlike staging
# deletes, this is NOT safely reversible:
#   - It alters historical numbers behind get_deals_stats() and any
#     PowerBI report built on this table.
#   - There is no "undo" — the original close_date/close_value/etc. would
#     have to be reconstructed manually if this was a mistake.
#   - If the source system Talend pulls from still has this record, the
#     next ETL run may silently re-insert it, making the delete look like
#     it "didn't work."
#
# Only the Fact_Opportunity row is removed — Dim_Agent / Dim_Company /
# Dim_Plan / Dim_Stage rows are NOT touched, since other deals may
# reference the same dimension keys.

def delete_warehouse_deal(opportunity_id: int) -> None:
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        DELETE FROM public."Fact_Opportunity"
                        WHERE "ID_Opportunity" = %s
                        """, (opportunity_id,))
            if cur.rowcount == 0:
                raise ValueError(
                    f"Deal '{opportunity_id}' not found in the warehouse."
                )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_warehouse_conn(conn)