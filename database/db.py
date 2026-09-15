from contextlib import contextmanager

import mysql.connector
from mysql.connector import Error, pooling

from config import Config


class DatabaseError(RuntimeError):
    """Raised when a database operation cannot be completed."""


_pool = None


def _get_pool():
    global _pool
    if _pool is None:
        try:
            _pool = pooling.MySQLConnectionPool(
                pool_name="smart_recipe_pool",
                pool_size=Config.DB_POOL_SIZE,
                host=Config.DB_HOST,
                port=Config.DB_PORT,
                user=Config.DB_USER,
                password=Config.DB_PASSWORD,
                database=Config.DB_NAME,
            )
        except Error as exc:
            raise DatabaseError("Database connection pool could not be created.") from exc
    return _pool


def get_db_connection():
    """Return a pooled MySQL connection."""
    try:
        return _get_pool().get_connection()
    except Error as exc:
        raise DatabaseError("Database connection could not be established.") from exc


@contextmanager
def get_db_cursor():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        yield connection, cursor
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


def execute_query(query, params=None, *, fetch_one=False, fetch_all=False):
    """Execute a parameterized query and optionally return dictionary rows."""
    try:
        with get_db_cursor() as (connection, cursor):
            cursor.execute(query, params or ())
            if fetch_one:
                return cursor.fetchone()
            if fetch_all:
                return cursor.fetchall()
            connection.commit()
            return {"lastrowid": cursor.lastrowid, "rowcount": cursor.rowcount}
    except Error as exc:
        raise DatabaseError("Database query failed.") from exc
