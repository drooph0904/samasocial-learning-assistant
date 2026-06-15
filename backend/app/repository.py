from app.db import get_db
from app.retry import with_retry


@with_retry()
def create_session() -> str:
    res = get_db().table("sessions").insert({}).execute()
    return res.data[0]["id"]


@with_retry()
def ensure_session(session_id: str) -> str:
    db = get_db()
    existing = db.table("sessions").select("id").eq("id", session_id).execute()
    if not existing.data:
        db.table("sessions").insert({"id": session_id}).execute()
    return session_id


@with_retry()
def create_source(session_id: str, type_: str, title: str) -> str:
    res = (
        get_db()
        .table("sources")
        .insert({"session_id": session_id, "type": type_, "title": title, "status": "processing"})
        .execute()
    )
    return res.data[0]["id"]


@with_retry()
def update_source(source_id: str, **fields) -> None:
    get_db().table("sources").update(fields).eq("id", source_id).execute()


@with_retry()
def list_sources(session_id: str) -> list[dict]:
    return (
        get_db()
        .table("sources")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
        .data
    )


@with_retry()
def get_source(source_id: str) -> dict | None:
    res = get_db().table("sources").select("*").eq("id", source_id).execute()
    return res.data[0] if res.data else None


@with_retry()
def _insert_chunk_batch(batch: list[dict]) -> None:
    get_db().table("chunks").insert(batch).execute()


def insert_chunks(rows: list[dict], batch_size: int = 100) -> None:
    # Insert in batches: a single bulk insert of hundreds of 1536-dim vectors
    # can exceed Supabase's per-statement timeout (error 57014). Retry is applied
    # per batch so a transient failure never re-inserts an already-stored batch.
    for i in range(0, len(rows), batch_size):
        _insert_chunk_batch(rows[i : i + batch_size])


@with_retry()
def match_chunks(query_embedding: list[float], session_id: str, k: int) -> list[dict]:
    return (
        get_db()
        .rpc(
            "match_chunks",
            {"query_embedding": query_embedding, "p_session_id": session_id, "match_count": k},
        )
        .execute()
        .data
    )


@with_retry()
def add_message(session_id: str, role: str, content: str, citations: list | None = None) -> None:
    get_db().table("messages").insert(
        {"session_id": session_id, "role": role, "content": content, "citations": citations or []}
    ).execute()


@with_retry()
def list_messages(session_id: str, limit: int = 20) -> list[dict]:
    rows = (
        get_db()
        .table("messages")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
    )
    return rows[::-1]
