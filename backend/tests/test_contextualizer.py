from app.rag import contextualizer as ctx


def _fake_client(captured, reply="rewritten query"):
    class FakeCompletions:
        def create(self, **kw):
            captured["msgs"] = kw["messages"]
            return type(
                "R",
                (),
                {"choices": [type("C", (), {"message": type("M", (), {"content": reply})()})()]},
            )()

    class FakeClient:
        chat = type("Chat", (), {"completions": FakeCompletions()})()

    return FakeClient()


def test_no_history_returns_message_unchanged_without_calling_llm(monkeypatch):
    called = {"n": 0}

    def boom():
        called["n"] += 1
        raise AssertionError("LLM should not be called on first turn")

    monkeypatch.setattr(ctx, "get_openai", boom)
    assert ctx.condense_query([], "What is a for loop?") == "What is a for loop?"
    assert called["n"] == 0


def test_followup_is_rewritten_using_history(monkeypatch):
    captured = {}
    monkeypatch.setattr(ctx, "get_openai", lambda: _fake_client(captured, "for loop vs while loop simple analogy"))
    history = [
        {"role": "user", "content": "Difference between for and while loop?"},
        {"role": "assistant", "content": "A for loop iterates a sequence; a while loop repeats until false."},
    ]
    out = ctx.condense_query(history, "give me a simpler analogy")
    assert out == "for loop vs while loop simple analogy"
    # the prior turns must be included in the prompt sent to the model
    assert "while loop" in captured["msgs"][1]["content"]


def test_empty_rewrite_falls_back_to_original(monkeypatch):
    captured = {}
    monkeypatch.setattr(ctx, "get_openai", lambda: _fake_client(captured, "   "))
    out = ctx.condense_query([{"role": "user", "content": "x"}], "original message")
    assert out == "original message"
