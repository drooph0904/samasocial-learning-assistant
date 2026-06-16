from fastapi import APIRouter, HTTPException

from app.models.schemas import QuizRequest
from app.rag.quiz import generate_quiz
from app.repository import get_source, get_source_chunks

router = APIRouter(prefix="/api", tags=["quiz"])

# cap context per source so a long video doesn't blow the prompt
_MAX_CHUNKS_PER_SOURCE = 25


def _sample_evenly(items: list, k: int) -> list:
    """Pick up to k items spread evenly across the list (for topic coverage)."""
    if len(items) <= k:
        return items
    step = len(items) / k
    return [items[int(i * step)] for i in range(k)]


@router.post("/quiz")
def quiz(req: QuizRequest):
    selections = [s for s in req.selections if s.count > 0]
    if not selections:
        raise HTTPException(400, "Select at least one source and a question count")

    questions: list[dict] = []
    for sel in selections:
        src = get_source(sel.source_id)
        if not src or src.get("status") != "ready":
            continue
        chunks = get_source_chunks(sel.source_id)
        if not chunks:
            continue
        sampled = _sample_evenly([c["content"] for c in chunks], _MAX_CHUNKS_PER_SOURCE)
        context = "\n\n".join(sampled)
        source_label = src.get("title") or src.get("type")
        for q in generate_quiz(context, n=sel.count):
            questions.append(
                {
                    "question": q.get("question", ""),
                    "answer": q.get("answer", ""),
                    "source": source_label,
                    "source_id": sel.source_id,
                }
            )

    if not questions:
        raise HTTPException(400, "No ready sources with content to quiz on")
    return {"questions": questions}
