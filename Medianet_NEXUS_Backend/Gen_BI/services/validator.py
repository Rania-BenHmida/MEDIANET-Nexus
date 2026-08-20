"""
validator.py
Robust read-only SQL guard for Gen BI. Unchanged in spirit from the original
FastAPI project — sqlglot AST parsing, SELECT-only, single statement,
schema + table whitelist sourced from schema_context.json.

Only difference vs the original: schema_context.json lives inside the app
package (genbi/schema_context.json) rather than a sibling context/ folder.
"""

import json
from pathlib import Path

import sqlglot
from sqlglot import parse_one
from sqlglot.errors import ParseError

# schema_context.json sits one level up from services/ (i.e. in the app root).
_APP_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = _APP_ROOT / "schema_context.json"

_FALLBACK_TABLES = {
    "Fact_Churn", "Fact_Subscription", "Fact_Opportunity", "Fact_Ticket", "Fact_Log",
    "Dim_Customer", "Dim_Company", "Dim_Date", "Dim_Status", "Dim_Stage", "Dim_Plan",
    "Dim_Agent", "Dim_Channel", "Dim_Contract", "Dim_Location", "Dim_Offer",
    "Dim_Priority", "Dim_Project", "Dim_Employee", "Dim_Task", "Dim_Section",
    "Dim_Tag", "Dim_Comment",
}

ALLOWED_SCHEMAS = {"public", "dw_customersuccess"}


def _load_allowed_tables() -> set[str]:
    if not SCHEMA_PATH.exists():
        return set(_FALLBACK_TABLES)
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema = json.load(f)
    facts = set(schema.get("fact_tables", {}).keys())
    dims = set(schema.get("dimension_tables", {}).keys())
    return facts | dims


ALLOWED_TABLES = _load_allowed_tables()


def validate_sql(sql: str) -> tuple[bool, str]:
    """
    Returns (is_valid, error_message).

    Enforces:
      - non-empty
      - single statement (a trailing ';' is tolerated; any interior ';'
        is treated as statement-chaining and rejected)
      - parses as PostgreSQL
      - root node is SELECT or a UNION of SELECTs (blocks INSERT/UPDATE/DELETE/DROP/etc.)
      - every referenced schema is in ALLOWED_SCHEMAS
      - every referenced REAL table is in the whitelist (CTEs defined via
        WITH ... AS (...) are exempt — see note below)
    """
    sql = sql.strip()

    if not sql:
        return False, "Empty SQL statement"

    # A single trailing semicolon is harmless (LLMs commonly emit one), so
    # strip it before checking. Any semicolon that remains sits *inside* the
    # query and indicates statement-chaining (e.g. "SELECT ...; DROP ..."),
    # which we reject. The SELECT-only check below is the real guard against
    # destructive statements (DELETE/UPDATE/DROP/etc.) — this only stops
    # injection via chaining.
    sql = sql.rstrip().rstrip(";").rstrip()
    if ";" in sql:
        return False, "Multiple SQL statements are not allowed"

    try:
        ast = parse_one(sql, dialect="postgres")
    except ParseError as e:
        return False, f"SQL parsing error: {str(e)}"

    if not ast:
        return False, "Only SELECT queries are allowed"

    # A UNION ALL query (used by the MULTI-DOMAIN SUMMARIES pattern) parses
    # with a root node of type Union, not Select, even though every branch
    # underneath it is a SELECT — SQL's grammar doesn't allow anything other
    # than SELECT statements inside a UNION anyway, so accepting a Union root
    # here doesn't weaken the SELECT-only guarantee at all.
    if not isinstance(ast, (sqlglot.exp.Select, sqlglot.exp.Union)):
        return False, "Only SELECT queries are allowed"

    # A CTE ("WITH stage_win_rate AS (...) SELECT ... FROM stage_win_rate")
    # is a query-local, temporary relation — not a real warehouse table. But
    # sqlglot parses its usage in FROM/JOIN as an exp.Table node exactly like
    # a real table reference, with no built-in way to tell them apart at that
    # node alone. Without this exclusion, ANY query using a CTE gets rejected
    # as an unknown table the moment its name doesn't happen to collide with
    # a real one — which blocks a normal, encouraged pattern (e.g. the
    # historical-win-rate-by-stage CTE from B2B LOYALTY / CHURN-RISK SCORING
    # and win-likelihood questions in general), not just an edge case.
    cte_names = {cte.alias for cte in ast.find_all(sqlglot.exp.CTE)}

    referenced_tables = set()
    for table in ast.find_all(sqlglot.exp.Table):
        if table.name in cte_names:
            continue
        schema_name = table.db or "public"
        if schema_name.lower() not in ALLOWED_SCHEMAS:
            return False, f"Access to schema '{schema_name}' is not allowed"
        referenced_tables.add(table.name)

    for table in referenced_tables:
        if table not in ALLOWED_TABLES:
            return False, f"Table '{table}' is not in the allowed schema (whitelist)"

    return True, ""