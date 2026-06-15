from fastapi import APIRouter, HTTPException

from app.models.schemas import QuizRequest
from app.rag.embeddings import embed_query
from app.rag.quiz import generate_quiz
from app.rag.retriever import build_context
from app.repository import match_chunks

router = APIRouter(prefix="/api", tags=["quiz"])


@router.post("/quiz")
def quiz(req: QuizRequest):
    # pull a spread of chunks via a generic query embedding
    emb = embed_query("key concepts and main ideas")
    hits = match_chunks(emb, req.session_id, 12)
    if not hits:
        raise HTTPException(400, "No sources loaded for this session")
    questions = generate_quiz(build_context(hits), n=req.n)
    return {"questions": questions}
