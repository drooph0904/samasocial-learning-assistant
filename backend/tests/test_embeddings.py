from app.rag import embeddings as emb


def test_embed_texts_returns_vectors(monkeypatch):
    class FakeResp:
        data = [
            type("D", (), {"embedding": [0.1, 0.2]})(),
            type("D", (), {"embedding": [0.3, 0.4]})(),
        ]

    class FakeEmb:
        def create(self, **kw):
            return FakeResp()

    class FakeClient:
        embeddings = FakeEmb()

    monkeypatch.setattr(emb, "get_openai", lambda: FakeClient())
    out = emb.embed_texts(["a", "b"])
    assert out == [[0.1, 0.2], [0.3, 0.4]]


def test_embed_texts_empty():
    assert emb.embed_texts([]) == []
