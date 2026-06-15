import tiktoken

from app.ingestion.base import Chunk

_enc = tiktoken.get_encoding("cl100k_base")


def chunk_segments(
    segments: list[tuple[str, dict]],
    max_tokens: int = 500,
    overlap: int = 50,
) -> list[Chunk]:
    """Token-chunk each segment independently so source metadata stays attached."""
    chunks: list[Chunk] = []
    for text, meta in segments:
        text = (text or "").strip()
        if not text:
            continue
        tokens = _enc.encode(text)
        if len(tokens) <= max_tokens:
            chunks.append(Chunk(content=text, metadata=dict(meta)))
            continue
        start = 0
        while start < len(tokens):
            window = tokens[start : start + max_tokens]
            chunks.append(Chunk(content=_enc.decode(window), metadata=dict(meta)))
            if start + max_tokens >= len(tokens):
                break
            start += max_tokens - overlap
    return chunks
