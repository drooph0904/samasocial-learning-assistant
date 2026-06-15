from app.db import get_db


def create_session() -> str:
    res = get_db().table("sessions").insert({}).execute()
    return res.data[0]["id"]


def ensure_session(session_id: str) -> str:
    db = get_db()
    existing = db.table("sessions").select("id").eq("id", session_id).execute()
    if not existing.data:
        db.table("sessions").insert({"id": session_id}).execute()
    return session_id


def create_source(session_id: str, type_: str, title: str) -> str:
    res = (
        get_db()
        .table("sources")
        .insert({"session_id": session_id, "type": type_, "title": title, "status": "processing"})
        .execute()
    )
    return res.data[0]["id"]


def update_source(source_id: str, **fields) -> None:
    get_db().table("sources").update(fields).eq("id", source_id).execute()


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


def get_source(source_id: str) -> dict | None:
    res = get_db().table("sources").select("*").eq("id", source_id).execute()
    return res.data[0] if res.data else None


def insert_chunks(rows: list[dict]) -> None:
    if rows:
        get_db().table("chunks").insert(rows).execute()


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


def add_message(session_id: str, role: str, content: str, citations: list | None = None) -> None:
    get_db().table("messages").insert(
        {"session_id": session_id, "role": role, "content": content, "citations": citations or []}
    ).execute()


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
