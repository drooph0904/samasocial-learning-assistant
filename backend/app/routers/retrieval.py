from fastapi import APIRouter

from app.config import get_settings
from app.models.schemas import RetrievedChunk, RetrieveRequest, RetrieveResponse
from app.rag.retriever import retrieve

router = APIRouter()


@router.post("/retrieve", response_model=RetrieveResponse)
def retrieve_chunks(req: RetrieveRequest) -> RetrieveResponse:
    s = get_settings()
    hits = retrieve(req.query, s.corpus_session_id, req.top_k, s.retrieval_min_score)
    results = [
        RetrievedChunk(
            content=h["content"],
            filename=h["metadata"].get("filename"),
            page=h["metadata"].get("page"),
            similarity=h.get("similarity"),
            rerank_score=h.get("rerank_score"),
        )
        for h in hits
    ]
    return RetrieveResponse(results=results)
