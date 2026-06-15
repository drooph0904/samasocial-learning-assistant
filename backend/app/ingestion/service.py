from app.ingestion.chunker import chunk_segments
from app.ingestion.pdf import PdfParser
from app.ingestion.pptx import PptxParser
from app.ingestion.webpage import WebpageParser
from app.ingestion.youtube import YoutubeParser
from app.rag.embeddings import embed_texts
from app.rag.summarizer import summarize_source
from app.repository import insert_chunks, update_source

_PARSERS = {
    "pdf": PdfParser,
    "pptx": PptxParser,
    "youtube": YoutubeParser,
    "webpage": WebpageParser,
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
        full_text = "\n".join(c.content for c in chunks)
        summary = summarize_source(full_text)
        update_source(source_id, status="ready", title=parsed.title, summary=summary)
    except Exception as e:  # noqa: BLE001
        update_source(source_id, status="error", error=str(e))
