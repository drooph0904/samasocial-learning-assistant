import pytest
from fastapi import HTTPException

from app.models.schemas import QuizRequest, QuizSelection
from app.routers import quiz as qr


def test_sample_evenly_spreads_and_caps():
    items = list(range(100))
    out = qr._sample_evenly(items, 5)
    assert len(out) == 5
    assert out[0] == 0
    assert out == sorted(out)  # preserves order / spread across the list


def test_sample_evenly_returns_all_when_fewer():
    assert qr._sample_evenly([1, 2], 5) == [1, 2]


def test_quiz_tags_questions_with_source(monkeypatch):
    monkeypatch.setattr(qr, "get_source", lambda sid: {"status": "ready", "title": "deck.pptx", "type": "pptx"})
    monkeypatch.setattr(qr, "get_source_chunks", lambda sid: [{"content": "loops repeat code"}])
    monkeypatch.setattr(qr, "generate_quiz", lambda ctx, n: [{"question": f"Q{i}", "answer": f"A{i}"} for i in range(n)])

    out = qr.quiz(QuizRequest(session_id="s", selections=[QuizSelection(source_id="src1", count=2)]))
    assert len(out["questions"]) == 2
    assert all(q["source"] == "deck.pptx" for q in out["questions"])
    assert all(q["source_id"] == "src1" for q in out["questions"])


def test_quiz_rejects_empty_selection():
    with pytest.raises(HTTPException):
        qr.quiz(QuizRequest(session_id="s", selections=[QuizSelection(source_id="x", count=0)]))


def test_quiz_skips_not_ready_sources(monkeypatch):
    monkeypatch.setattr(qr, "get_source", lambda sid: {"status": "processing", "title": "x", "type": "pdf"})
    monkeypatch.setattr(qr, "get_source_chunks", lambda sid: [])
    monkeypatch.setattr(qr, "generate_quiz", lambda ctx, n: [])
    with pytest.raises(HTTPException):
        qr.quiz(QuizRequest(session_id="s", selections=[QuizSelection(source_id="x", count=3)]))
