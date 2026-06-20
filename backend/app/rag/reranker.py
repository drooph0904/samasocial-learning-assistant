from functools import lru_cache

from app.config import get_settings


@lru_cache
def _get_reranker():
    from sentence_transformers import CrossEncoder

    return CrossEncoder(get_settings().reranker_model)


def rerank(query: str, hits: list[dict], top_k: int) -> list[dict]:
    if not hits:
        return []
    ce = _get_reranker()
    scores = ce.predict([(query, h["content"]) for h in hits], show_progress_bar=False)
    for h, s in zip(hits, scores):
        h["rerank_score"] = float(s)
    ranked = sorted(hits, key=lambda h: h["rerank_score"], reverse=True)
    return ranked[:top_k]
