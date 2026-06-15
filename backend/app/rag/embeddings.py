from app.config import get_settings
from app.openai_client import get_openai


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    resp = get_openai().embeddings.create(model=get_settings().openai_embed_model, input=texts)
    return [d.embedding for d in resp.data]


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]
