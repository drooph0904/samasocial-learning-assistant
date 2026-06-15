from app.rag.citations import label_for
from app.rag.embeddings import embed_query
from app.repository import match_chunks


def retrieve(query: str, session_id: str, top_k: int, min_score: float) -> list[dict]:
    emb = embed_query(query)
    hits = match_chunks(emb, session_id, top_k)
    return [h for h in hits if h.get("similarity", 0) >= min_score]


def build_context(hits: list[dict]) -> str:
    blocks = []
    for h in hits:
        blocks.append(f"[{label_for(h['metadata'])}]\n{h['content']}")
    return "\n\n".join(blocks)
