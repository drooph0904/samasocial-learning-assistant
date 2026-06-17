from app.rag import generator as g


def test_system_prompt_demands_grounding():
    p = g.build_system_prompt().lower()
    # facts must be grounded in context, and the model must cite sources
    assert "context" in p
    assert "never invent facts" in p or "do not invent" in p
    assert "cite" in p


def test_system_prompt_allows_teaching():
    # the prompt must permit pedagogy (analogies/simplifying) so doubt-resolution works
    p = g.build_system_prompt().lower()
    assert "analog" in p or "simplify" in p


def test_system_prompt_asks_clarifying_instead_of_dead_end():
    p = g.build_system_prompt().lower()
    assert "clarif" in p
    assert "dead-end" in p or "dead end" in p


def test_stream_answer_includes_sources_overview(monkeypatch):
    captured = {}

    class Chunk:
        def __init__(self, t):
            self.choices = [type("C", (), {"delta": type("D", (), {"content": t})()})()]

    class FakeCompletions:
        def create(self, **kw):
            captured["messages"] = kw["messages"]
            return iter([Chunk("Hel"), Chunk("lo"), Chunk(None)])

    class FakeClient:
        chat = type("Chat", (), {"completions": FakeCompletions()})()

    monkeypatch.setattr(g, "get_openai", lambda: FakeClient())
    out = "".join(g.stream_answer("q", "ctx", [], "- (pdf) notes.pdf: about cells"))
    assert out == "Hello"
    # the loaded-sources roster must be passed to the model
    assert "notes.pdf" in captured["messages"][-1]["content"]
    assert "SESSION SOURCES" in captured["messages"][-1]["content"]
