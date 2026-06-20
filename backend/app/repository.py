import json

import numpy as np

from app.db import get_pool
from app.retry import with_retry

_ALLOWED_SOURCE_COLS = {"status", "title", "summary", "error"}


@with_retry()
def create_session() -> str:
    with get_pool().connection() as c:
        row = c.execute("insert into sessions default values returning id").fetchone()
    return str(row["id"])


@with_retry()
def ensure_session(session_id: str) -> str:
    with get_pool().connection() as c:
        c.execute(
            "insert into sessions (id) values (%s) on conflict (id) do nothing",
            (session_id,),
        )
    return session_id


@with_retry()
def create_source(session_id: str, type_: str, title: str) -> str:
    with get_pool().connection() as c:
        row = c.execute(
            "insert into sources (session_id, type, title, status) "
            "values (%s, %s, %s, 'processing') returning id",
            (session_id, type_, title),
        ).fetchone()
    return str(row["id"])


@with_retry()
def update_source(source_id: str, **fields) -> None:
    if not fields:
        return
    bad = set(fields) - _ALLOWED_SOURCE_COLS
    if bad:
        raise ValueError(f"Disallowed source column(s): {sorted(bad)}")
    cols = ", ".join(f"{k} = %s" for k in fields)
    with get_pool().connection() as c:
        c.execute(
            f"update sources set {cols} where id = %s",
            (*fields.values(), source_id),
        )


@with_retry()
def delete_session(session_id: str) -> None:
    with get_pool().connection() as c:
        c.execute("delete from sessions where id = %s", (session_id,))


@with_retry()
def delete_source(source_id: str) -> None:
    with get_pool().connection() as c:
        c.execute("delete from sources where id = %s", (source_id,))


@with_retry()
def list_sources(session_id: str) -> list[dict]:
    with get_pool().connection() as c:
        return c.execute(
            "select * from sources where session_id = %s order by created_at",
            (session_id,),
        ).fetchall()


@with_retry()
def get_source(source_id: str) -> dict | None:
    with get_pool().connection() as c:
        return c.execute(
            "select * from sources where id = %s", (source_id,)
        ).fetchone()


def insert_chunks(rows: list[dict], batch_size: int = 100) -> None:
    for i in range(0, len(rows), batch_size):
        _insert_chunk_batch(rows[i : i + batch_size])


@with_retry()
def _insert_chunk_batch(batch: list[dict]) -> None:
    if not batch:
        return
    with get_pool().connection() as c, c.cursor() as cur:
        cur.executemany(
            "insert into chunks (session_id, source_id, content, embedding, metadata) "
            "values (%s, %s, %s, %s, %s)",
            [
                (
                    r["session_id"],
                    r["source_id"],
                    r["content"],
                    np.asarray(r["embedding"], dtype=np.float32),
                    json.dumps(r.get("metadata", {})),
                )
                for r in batch
            ],
        )


@with_retry()
def get_source_chunks(source_id: str, limit: int = 300) -> list[dict]:
    with get_pool().connection() as c:
        return c.execute(
            "select content, metadata from chunks where source_id = %s limit %s",
            (source_id, limit),
        ).fetchall()


@with_retry()
def match_chunks(query_embedding: list[float], session_id: str, k: int) -> list[dict]:
    vec = np.asarray(query_embedding, dtype=np.float32)
    with get_pool().connection() as c:
        return c.execute(
            "select * from match_chunks(%s, %s, %s)",
            (vec, session_id, k),
        ).fetchall()


@with_retry()
def quiz_insert(session_id: str, payload: dict, hints_used: int = 0) -> str:
    with get_pool().connection() as c:
        row = c.execute(
            "insert into quizzes (session_id, payload, hints_used) "
            "values (%s, %s, %s) returning id",
            (session_id, json.dumps(payload), hints_used),
        ).fetchone()
    return str(row["id"])


@with_retry()
def quiz_get(quiz_id: str) -> dict | None:
    with get_pool().connection() as c:
        return c.execute("select * from quizzes where id = %s", (quiz_id,)).fetchone()


@with_retry()
def quiz_update_hints(quiz_id: str, hints_used: int) -> None:
    with get_pool().connection() as c:
        c.execute(
            "update quizzes set hints_used = %s where id = %s", (hints_used, quiz_id)
        )


@with_retry()
def add_message(session_id: str, role: str, content: str, citations: list | None = None) -> None:
    with get_pool().connection() as c:
        c.execute(
            "insert into messages (session_id, role, content, citations) "
            "values (%s, %s, %s, %s)",
            (session_id, role, content, json.dumps(citations or [])),
        )


@with_retry()
def list_messages(session_id: str, limit: int = 20) -> list[dict]:
    with get_pool().connection() as c:
        rows = c.execute(
            "select * from messages where session_id = %s "
            "order by created_at desc limit %s",
            (session_id, limit),
        ).fetchall()
    return rows[::-1]
