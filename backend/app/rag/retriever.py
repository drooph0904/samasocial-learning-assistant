from app.config import get_settings
from app.rag import reranker
from app.rag.citations import label_for
from app.rag.embeddings import embed_query
from app.repository import match_chunks


def retrieve(query: str, session_id: str, top_k: int, min_score: float) -> list[dict]:
    s = get_settings()
    emb = embed_query(query)
    hits = match_chunks(emb, session_id, s.retrieve_candidates)
    hits = [h for h in hits if h.get("similarity", 0) >= min_score]
    if not hits:
        return []
    if s.rerank_enabled:
        return reranker.rerank(query, hits, top_k)
    return hits[:top_k]


def build_context(hits: list[dict]) -> str:
    blocks = []
    for h in hits:
        blocks.append(f"[{label_for(h['metadata'])}]\n{h['content']}")
    return "\n\n".join(blocks)
