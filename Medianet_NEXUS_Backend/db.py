"""
db.py
Single shared connection pool for warehouse + staging. Every app imports
from here instead of opening its own psycopg2.connect() per call.
"""

import os
from dotenv import load_dotenv
from psycopg2 import pool
from psycopg2.extras import RealDictCursor

load_dotenv()  # reads .env into os.environ

_warehouse_pool = pool.SimpleConnectionPool(
    1, 10, dsn=os.environ["WAREHOUSE_DATABASE_URL"], cursor_factory=RealDictCursor,
)
_staging_pool = pool.SimpleConnectionPool(
    1, 10, dsn=os.environ["STAGING_DATABASE_URL"], cursor_factory=RealDictCursor,
)


def get_warehouse_conn():
    return _warehouse_pool.getconn()


def release_warehouse_conn(conn):
    _warehouse_pool.putconn(conn)


def get_staging_conn():
    return _staging_pool.getconn()


def release_staging_conn(conn):
    _staging_pool.putconn(conn)