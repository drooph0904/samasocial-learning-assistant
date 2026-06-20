from functools import lru_cache

from app.config import get_settings

# BGE-v1.5 recommends a retrieval instruction on the QUERY only; passages plain.
_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "
_BATCH = 64


@lru_cache
def _get_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(get_settings().embed_model)


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = _get_model()
    vecs = model.encode(
        texts, batch_size=_BATCH, normalize_embeddings=True, show_progress_bar=False
    )
    return [list(map(float, v)) for v in vecs]


def embed_query(text: str) -> list[float]:
    model = _get_model()
    vec = model.encode(
        [_QUERY_INSTRUCTION + text],
        normalize_embeddings=True,
        show_progress_bar=False,
    )[0]
    return list(map(float, vec))
