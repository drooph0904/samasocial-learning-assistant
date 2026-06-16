import uuid

import pytest
from fastapi import HTTPException

from app import quiz_store, repository
from app.models.schemas import GradeRequest, HintRequest, QuizRequest, QuizSelection
from app.routers import quiz as qr


@pytest.fixture(autouse=True)
def _mem_quiz_store(monkeypatch):
    """Back the quiz store with an in-memory dict so unit tests don't hit Supabase."""
    store: dict[str, dict] = {}

    def ins(session_id, payload, hints_used=0):
        qid = str(uuid.uuid4())
        store[qid] = {"id": qid, "session_id": session_id, "payload": payload, "hints_used": hints_used}
        return qid

    monkeypatch.setattr(repository, "quiz_insert", ins)
    monkeypatch.setattr(repository, "quiz_get", lambda qid: store.get(qid))
    monkeypatch.setattr(
        repository,
        "quiz_update_hints",
        lambda qid, h: store[qid].__setitem__("hints_used", h),
    )


def test_sample_evenly_spreads_and_caps():
    out = qr._sample_evenly(list(range(100)), 5)
    assert len(out) == 5 and out[0] == 0 and out == sorted(out)


def test_hint_budget_thresholds():
    assert quiz_store.hint_budget(20) == 3
    assert quiz_store.hint_budget(15) == 3
    assert quiz_store.hint_budget(14) == 2
    assert quiz_store.hint_budget(1) == 2


def _stub_generation(monkeypatch):
    monkeypatch.setattr(qr, "get_source", lambda sid: {"status": "ready", "title": "deck", "type": "pptx"})
    monkeypatch.setattr(qr, "get_source_chunks", lambda sid: [{"content": "Python loops repeat code"}])
    monkeypatch.setattr(
        qr,
        "generate_questions",
        lambda ctx, nm, nw, diff="medium": (
            [{"type": "mcq", "question": "Q-mcq", "options": ["a", "b", "c", "d"], "correct_index": 1, "answer": "b", "explanation": "because b"}] * nm
            + [{"type": "written", "question": "Q-wr", "answer": "model ans", "explanation": "expl"}] * nw
        ),
    )


def test_quiz_generation_hides_answers_and_assigns_ids(monkeypatch):
    _stub_generation(monkeypatch)
    out = qr.quiz(QuizRequest(session_id="s", selections=[QuizSelection(source_id="x", mcq_count=2, written_count=1)]))
    assert len(out["questions"]) == 3
    # public questions must NOT leak correct answers / explanations
    for pub in out["questions"]:
        assert "correct_index" not in pub and "answer" not in pub and "explanation" not in pub
    mcq = next(q for q in out["questions"] if q["type"] == "mcq")
    assert mcq["options"] == ["a", "b", "c", "d"]
    assert out["hints_total"] == 2  # 3 questions < 15


def test_quiz_grade_scores_mcq_and_written(monkeypatch):
    _stub_generation(monkeypatch)
    monkeypatch.setattr(qr, "grade_written", lambda q, m, u: {"verdict": "partial", "feedback": "close"})
    gen = qr.quiz(QuizRequest(session_id="s", selections=[QuizSelection(source_id="x", mcq_count=1, written_count=1)]))
    qid = gen["quiz_id"]
    # mcq q0 correct_index=1 -> answer "1" correct; written q1 -> partial
    res = qr.grade(GradeRequest(quiz_id=qid, answers={"q0": "1", "q1": "something"}))
    by_id = {r["id"]: r for r in res["results"]}
    assert by_id["q0"]["verdict"] == "correct"
    assert by_id["q1"]["verdict"] == "partial"
    assert res["score"]["correct"] == 1 and res["score"]["partial"] == 1
    assert res["score"]["points"] == 1.5


def test_quiz_grade_wrong_mcq(monkeypatch):
    _stub_generation(monkeypatch)
    gen = qr.quiz(QuizRequest(session_id="s", selections=[QuizSelection(source_id="x", mcq_count=1, written_count=0)]))
    res = qr.grade(GradeRequest(quiz_id=gen["quiz_id"], answers={"q0": "0"}))
    assert res["results"][0]["verdict"] == "incorrect"
    assert res["results"][0]["correct_answer"] == "b"


def test_hint_budget_enforced(monkeypatch):
    _stub_generation(monkeypatch)
    monkeypatch.setattr(qr, "make_hint", lambda q, a: "think about it")
    gen = qr.quiz(QuizRequest(session_id="s", selections=[QuizSelection(source_id="x", mcq_count=1, written_count=1)]))
    qid = gen["quiz_id"]
    r1 = qr.hint(HintRequest(quiz_id=qid, question_id="q0"))
    assert r1["hints_remaining"] == 1
    qr.hint(HintRequest(quiz_id=qid, question_id="q1"))  # uses 2nd (budget=2)
    with pytest.raises(HTTPException):
        qr.hint(HintRequest(quiz_id=qid, question_id="q0"))  # 3rd -> denied


def test_quiz_rejects_empty_selection():
    with pytest.raises(HTTPException):
        qr.quiz(QuizRequest(session_id="s", selections=[QuizSelection(source_id="x", mcq_count=0, written_count=0)]))
