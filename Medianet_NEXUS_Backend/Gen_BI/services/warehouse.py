"""
warehouse.py
Read-only query execution for Gen BI, reusing the shared warehouse pool from
the project-level db.py. This replaces the standalone psycopg2 db.py that
shipped with the original Gen BI project — no second connection path, no
pool-release footgun.

Import path assumption: the shared pool module is importable as `db`
(the same module the deals/projects apps import). If your project exposes it
under a package path (e.g. `config.db`), change the import below to match.
"""

from db import get_warehouse_conn, release_warehouse_conn


def run_query(sql: str) -> list[dict]:
    """
    Execute a validated read-only SELECT against the warehouse and return
    rows as a list of dicts. Assumes the caller has ALREADY passed `sql`
    through validator.validate_sql(). Never call this with unvalidated input.

    The shared pool is created with RealDictCursor, so rows come back as dicts.
    """
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
            return [dict(r) for r in rows]
    except Exception as e:
        # Surface as ValueError so the view/service layer can trigger the
        # LLM auto-correction retry, mirroring the original behaviour.
        raise ValueError(f"Query execution failed: {str(e)}")
    finally:
        release_warehouse_conn(conn)