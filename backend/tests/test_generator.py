from app.rag import generator as g


def test_system_prompt_demands_grounding():
    p = g.build_system_prompt().lower()
    # facts must be grounded in context, and the model must cite sources
    assert "context" in p
    assert "never introduce facts" in p or "do not invent facts" in p
    assert "cite" in p


def test_system_prompt_allows_teaching():
    # the prompt must permit pedagogy (analogies/simplifying) so doubt-resolution works
    p = g.build_system_prompt().lower()
    assert "analog" in p or "simplify" in p


def test_no_context_message():
    assert "don't have" in g.NO_CONTEXT_REPLY.lower() or "not" in g.NO_CONTEXT_REPLY.lower()


def test_stream_answer_yields_tokens(monkeypatch):
    class Chunk:
        def __init__(self, t):
            self.choices = [type("C", (), {"delta": type("D", (), {"content": t})()})()]

    class FakeCompletions:
        def create(self, **kw):
            return iter([Chunk("Hel"), Chunk("lo"), Chunk(None)])

    class FakeChat:
        completions = FakeCompletions()

    class FakeClient:
        chat = FakeChat()

    monkeypatch.setattr(g, "get_openai", lambda: FakeClient())
    out = "".join(g.stream_answer("q", "ctx", []))
    assert out == "Hello"
