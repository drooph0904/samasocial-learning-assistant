from app.rag import embeddings as emb


class _FakeModel:
    def encode(self, texts, **kw):
        # return a deterministic 768-d-ish vector per input (length 2 is fine for the test)
        return [[float(len(t)), 0.5] for t in texts]


def test_embed_texts_returns_vectors(monkeypatch):
    monkeypatch.setattr(emb, "_get_model", lambda: _FakeModel())
    out = emb.embed_texts(["ab", "cde"])
    assert out == [[2.0, 0.5], [3.0, 0.5]]


def test_embed_texts_empty():
    assert emb.embed_texts([]) == []


def test_embed_query_prefixes_instruction(monkeypatch):
    seen = {}

    class _M:
        def encode(self, texts, **kw):
            seen["texts"] = texts
            return [[0.1, 0.2]]

    monkeypatch.setattr(emb, "_get_model", lambda: _M())
    emb.embed_query("what is a transformer")
    assert seen["texts"][0].startswith("Represent this sentence")
