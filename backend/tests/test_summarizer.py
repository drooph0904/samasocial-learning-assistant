from app.rag import quiz as q
from app.rag import summarizer as s


def test_describe_source_returns_headline_and_summary(monkeypatch):
    payload = '{"headline":"Cell Biology Basics","summary":"A short summary of cells."}'

    class FakeCompletions:
        def create(self, **kw):
            return type(
                "R",
                (),
                {"choices": [type("C", (), {"message": type("M", (), {"content": payload})()})()]},
            )()

    class FakeClient:
        chat = type("Chat", (), {"completions": FakeCompletions()})()

    monkeypatch.setattr(s, "get_openai", lambda: FakeClient())
    out = s.describe_source("Some long text about cells", "pdf", "notes.pdf")
    assert out["headline"] == "Cell Biology Basics"
    assert out["summary"] == "A short summary of cells."


def test_title_for_sources_empty_is_new_chat():
    assert s.title_for_sources([]) == "New chat"
    assert s.title_for_sources([{"status": "processing", "title": "x"}]) == "New chat"


def test_title_for_sources_generates_from_ready(monkeypatch):
    captured = {}

    class FakeCompletions:
        def create(self, **kw):
            captured["msgs"] = kw["messages"]
            return type(
                "R", (), {"choices": [type("C", (), {"message": type("M", (), {"content": '"Python & life lessons."'})()})()]}
            )()

    class FakeClient:
        chat = type("Chat", (), {"completions": FakeCompletions()})()

    monkeypatch.setattr(s, "get_openai", lambda: FakeClient())
    title = s.title_for_sources(
        [
            {"status": "ready", "title": "deck.pptx", "summary": "Python basics"},
            {"status": "ready", "title": "talk", "summary": "life advice"},
        ]
    )
    assert title == "Python & life lessons"  # quotes + trailing period stripped
    assert "Python basics" in captured["msgs"][1]["content"]


def test_generate_questions_parses_mcq_and_written(monkeypatch):
    payload = (
        '{"mcqs":[{"question":"What is a cell?","options":["A","B","C","D"],'
        '"correct_index":2,"explanation":"because C"}],'
        '"written":[{"question":"Define life","answer":"the basic unit","explanation":"x"}]}'
    )

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
    out = q.generate_questions("context text", n_mcq=1, n_written=1)
    mcq = next(x for x in out if x["type"] == "mcq")
    assert mcq["question"] == "What is a cell?"
    assert mcq["correct_index"] == 2 and mcq["answer"] == "C"
    written = next(x for x in out if x["type"] == "written")
    assert written["answer"] == "the basic unit"
