from app.ingestion import service as svc
from app.ingestion.base import ParsedSource


def test_process_source_stores_chunks_and_summary(monkeypatch):
    calls = {}
    parsed = ParsedSource(title="Doc", segments=[("hello world " * 50, {"type": "pdf", "page": 1})])
    monkeypatch.setattr(svc, "get_parser", lambda type_: (lambda ref: parsed))
    monkeypatch.setattr(svc, "embed_texts", lambda texts: [[0.0] for _ in texts])
    monkeypatch.setattr(svc, "summarize_source", lambda text: "summary!")
    monkeypatch.setattr(svc, "insert_chunks", lambda rows: calls.setdefault("rows", rows))
    updates = []
    monkeypatch.setattr(svc, "update_source", lambda sid, **f: updates.append(f))

    svc.process_source("src1", "sess1", "pdf", "ref")

    assert calls["rows"][0]["session_id"] == "sess1"
    assert calls["rows"][0]["source_id"] == "src1"
    assert any(u.get("status") == "ready" for u in updates)
    assert any(u.get("summary") == "summary!" for u in updates)


def test_process_source_marks_error(monkeypatch):
    def boom(ref):
        raise ValueError("no transcript")

    monkeypatch.setattr(svc, "get_parser", lambda type_: boom)
    updates = []
    monkeypatch.setattr(svc, "update_source", lambda sid, **f: updates.append(f))
    svc.process_source("src1", "sess1", "youtube", "ref")
    assert any(u.get("status") == "error" for u in updates)
