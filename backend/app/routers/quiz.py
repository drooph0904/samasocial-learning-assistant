from fastapi import APIRouter, HTTPException

from app.models.schemas import GradeRequest, HintRequest, QuizRequest
from app.quiz_store import get_quiz, hint_budget, save_quiz, use_hint
from app.rag.grader import grade_written
from app.rag.quiz import generate_questions, make_hint
from app.repository import get_source, get_source_chunks

router = APIRouter(prefix="/api", tags=["quiz"])

_MAX_CHUNKS_PER_SOURCE = 25


def _sample_evenly(items: list, k: int) -> list:
    if len(items) <= k:
        return items
    step = len(items) / k
    return [items[int(i * step)] for i in range(k)]


def _public_question(qid: str, q: dict) -> dict:
    """Strip answers/explanations before sending to the client."""
    out = {"id": qid, "type": q["type"], "question": q["question"], "source": q.get("source")}
    if q["type"] == "mcq":
        out["options"] = q["options"]
    return out


@router.post("/quiz")
def quiz(req: QuizRequest):
    selections = [s for s in req.selections if (s.mcq_count + s.written_count) > 0]
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
        label = src.get("title") or src.get("type")
        for q in generate_questions(context, sel.mcq_count, sel.written_count, req.difficulty):
            q["source"] = label
            q["source_id"] = sel.source_id
            questions.append(q)

    if not questions:
        raise HTTPException(400, "No ready sources with content to quiz on")

    # assign stable ids and store full quiz (with answers) server-side
    for i, q in enumerate(questions):
        q["id"] = f"q{i}"
    quiz_id = save_quiz(req.session_id, questions)
    return {
        "quiz_id": quiz_id,
        "hints_total": hint_budget(len(questions)),
        "questions": [_public_question(q["id"], q) for q in questions],
    }


@router.post("/quiz/grade")
def grade(req: GradeRequest):
    quiz = get_quiz(req.quiz_id)
    if not quiz:
        raise HTTPException(404, "quiz not found (it may have expired)")

    results, correct, partial = [], 0, 0
    for q in quiz["questions"]:
        ua = req.answers.get(q["id"], "")
        if q["type"] == "mcq":
            try:
                chosen = int(ua)
            except (ValueError, TypeError):
                chosen = -1
            ok = chosen == q["correct_index"]
            verdict = "correct" if ok else "incorrect"
            if ok:
                correct += 1
            results.append(
                {
                    "id": q["id"],
                    "type": "mcq",
                    "verdict": verdict,
                    "your_answer": q["options"][chosen] if 0 <= chosen < len(q["options"]) else "(no answer)",
                    "correct_answer": q["options"][q["correct_index"]],
                    "explanation": q.get("explanation", ""),
                }
            )
        else:
            g = grade_written(q["question"], q["answer"], ua)
            if g["verdict"] == "correct":
                correct += 1
            elif g["verdict"] == "partial":
                partial += 1
            results.append(
                {
                    "id": q["id"],
                    "type": "written",
                    "verdict": g["verdict"],
                    "your_answer": ua or "(no answer)",
                    "correct_answer": q["answer"],
                    "feedback": g["feedback"],
                    "explanation": q.get("explanation", ""),
                }
            )

    total = len(quiz["questions"])
    score = correct + 0.5 * partial
    return {
        "results": results,
        "score": {"correct": correct, "partial": partial, "total": total, "points": score},
    }


@router.post("/quiz/hint")
def hint(req: HintRequest):
    quiz = get_quiz(req.quiz_id)
    if not quiz:
        raise HTTPException(404, "quiz not found")
    q = next((x for x in quiz["questions"] if x["id"] == req.question_id), None)
    if not q:
        raise HTTPException(404, "question not found")
    remaining = use_hint(req.quiz_id)
    if remaining is None:
        raise HTTPException(400, "No hints remaining")
    text = make_hint(q["question"], q["answer"])
    return {"hint": text, "hints_remaining": remaining}


@router.get("/quiz/{quiz_id}/key")
def answer_key(quiz_id: str):
    quiz = get_quiz(quiz_id)
    if not quiz:
        raise HTTPException(404, "quiz not found")
    return {
        "answers": [
            {
                "id": q["id"],
                "type": q["type"],
                "question": q["question"],
                "correct_answer": q["answer"],
                "explanation": q.get("explanation", ""),
                "source": q.get("source"),
            }
            for q in quiz["questions"]
        ]
    }
