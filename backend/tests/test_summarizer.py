from app.rag import quiz as q
from app.rag import summarizer as s


def test_summarize_calls_model(monkeypatch):
    captured = {}

    class FakeCompletions:
        def create(self, **kw):
            captured["msgs"] = kw["messages"]
            return type(
                "R",
                (),
                {"choices": [type("C", (), {"message": type("M", (), {"content": "A short summary."})()})()]},
            )()

    class FakeClient:
        chat = type("Chat", (), {"completions": FakeCompletions()})()

    monkeypatch.setattr(s, "get_openai", lambda: FakeClient())
    out = s.summarize_source("Some long text about cells")
    assert out == "A short summary."
    assert "summary" in captured["msgs"][0]["content"].lower()


def test_quiz_parses_json(monkeypatch):
    payload = '{"questions":[{"question":"What is a cell?","answer":"Basic unit of life"}]}'

    class FakeCompletions:
        def create(self, **kw):
            return type(
                "R",
                (),
                {"choices": [type("C", (), {"message": type("M", (), {"content": payload})()})()]},
            )()

    class FakeClient:
        chat = type("Chat", (), {"completions": FakeCompletions()})()

    monkeypatch.setattr(q, "get_openai", lambda: FakeClient())
    out = q.generate_quiz("context text", n=1)
    assert out[0]["question"] == "What is a cell?"
