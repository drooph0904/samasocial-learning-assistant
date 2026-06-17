from app.config import get_settings
from app.openai_client import get_openai


# OpenAI's embeddings endpoint caps the input array at 2048 items per request.
_EMBED_BATCH = 1000


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = get_settings().openai_embed_model
    out: list[list[float]] = []
    for i in range(0, len(texts), _EMBED_BATCH):
        batch = texts[i : i + _EMBED_BATCH]
        resp = get_openai().embeddings.create(model=model, input=batch)
        out.extend(d.embedding for d in resp.data)
    return out


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]
