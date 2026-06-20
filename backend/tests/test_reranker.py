from app.rag import reranker


class _FakeCE:
    def predict(self, pairs, **kw):
        # score = length of the candidate text (longer == more relevant, for the test)
        return [float(len(p[1])) for p in pairs]


def test_rerank_orders_by_cross_encoder(monkeypatch):
    monkeypatch.setattr(reranker, "_get_reranker", lambda: _FakeCE())
    hits = [
        {"content": "short", "metadata": {}},
        {"content": "a much longer chunk of text", "metadata": {}},
    ]
    out = reranker.rerank("q", hits, top_k=2)
    assert out[0]["content"] == "a much longer chunk of text"
    assert "rerank_score" in out[0]


def test_rerank_truncates_to_top_k(monkeypatch):
    monkeypatch.setattr(reranker, "_get_reranker", lambda: _FakeCE())
    hits = [{"content": f"c{i}" * i, "metadata": {}} for i in range(1, 6)]
    out = reranker.rerank("q", hits, top_k=2)
    assert len(out) == 2
