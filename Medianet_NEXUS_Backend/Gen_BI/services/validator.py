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
      - root node is SELECT (blocks INSERT/UPDATE/DELETE/DROP/etc.)
      - every referenced schema is in ALLOWED_SCHEMAS
      - every referenced table is in the whitelist
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

    if not ast or ast.key.upper() != "SELECT":
        return False, "Only SELECT queries are allowed"

    referenced_tables = set()
    for table in ast.find_all(sqlglot.exp.Table):
        schema_name = table.db or "public"
        if schema_name.lower() not in ALLOWED_SCHEMAS:
            return False, f"Access to schema '{schema_name}' is not allowed"
        referenced_tables.add(table.name)

    for table in referenced_tables:
        if table not in ALLOWED_TABLES:
            return False, f"Table '{table}' is not in the allowed schema (whitelist)"

    return True, ""