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


def test_embed_texts_batches_over_limit(monkeypatch):
    batch_sizes = []

    class FakeEmb:
        def create(self, **kw):
            n = len(kw["input"])
            batch_sizes.append(n)
            return type("R", (), {"data": [type("D", (), {"embedding": [0.0]})() for _ in range(n)]})()

    class FakeClient:
        embeddings = FakeEmb()

    monkeypatch.setattr(emb, "get_openai", lambda: FakeClient())
    monkeypatch.setattr(emb, "_EMBED_BATCH", 1000)
    out = emb.embed_texts([f"t{i}" for i in range(2500)])
    assert len(out) == 2500  # all embedded
    assert batch_sizes == [1000, 1000, 500]  # never exceeds the cap
