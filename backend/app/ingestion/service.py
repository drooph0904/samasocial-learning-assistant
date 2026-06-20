from app.ingestion.chunker import chunk_segments
from app.ingestion.pdf import PdfParser
from app.rag.embeddings import embed_texts
from app.repository import insert_chunks, update_source

_PARSERS = {
    "pdf": PdfParser,
}


def get_parser(type_: str):
    return _PARSERS[type_]().parse


def process_source(source_id: str, session_id: str, type_: str, ref: str) -> None:
    try:
        parsed = get_parser(type_)(ref)
        chunks = chunk_segments(parsed.segments)
        embeddings = embed_texts([c.content for c in chunks])
        rows = [
            {
                "session_id": session_id,
                "source_id": source_id,
                "content": c.content,
                "embedding": e,
                "metadata": c.metadata,
            }
            for c, e in zip(chunks, embeddings)
        ]
        insert_chunks(rows)
        # Source title is already set to filename at create time
        update_source(source_id, status="ready")
    except Exception as e:  # noqa: BLE001
        update_source(source_id, status="error", error=str(e))
