import atexit
from functools import lru_cache

from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import get_settings


def _configure(conn):
    register_vector(conn)


@lru_cache
def get_pool() -> ConnectionPool:
    s = get_settings()
    return ConnectionPool(
        conninfo=s.database_url,
        min_size=1,
        max_size=10,
        kwargs={"row_factory": dict_row},
        configure=_configure,
        open=True,
    )


@atexit.register
def _close_pool() -> None:
    if get_pool.cache_info().currsize:
        get_pool().close()
