from app.rag import retriever as r


def test_retrieve_filters_below_min_score(monkeypatch):
    monkeypatch.setattr(r, "get_settings", lambda: type("S", (), {"retrieve_candidates": 20, "rerank_enabled": False})())
    monkeypatch.setattr(r, "embed_query", lambda q: [0.0])
    monkeypatch.setattr(
        r,
        "match_chunks",
        lambda emb, sid, k: [
            {"content": "good", "metadata": {"type": "pdf", "page": 1}, "similarity": 0.8},
            {"content": "weak", "metadata": {"type": "pdf", "page": 2}, "similarity": 0.1},
        ],
    )
    hits = r.retrieve("q", "sess", top_k=6, min_score=0.25)
    assert len(hits) == 1
    assert hits[0]["content"] == "good"


def test_retrieve_empty_when_all_weak(monkeypatch):
    monkeypatch.setattr(r, "get_settings", lambda: type("S", (), {"retrieve_candidates": 20, "rerank_enabled": False})())
    monkeypatch.setattr(r, "embed_query", lambda q: [0.0])
    monkeypatch.setattr(
        r,
        "match_chunks",
        lambda emb, sid, k: [{"content": "weak", "metadata": {}, "similarity": 0.05}],
    )
    assert r.retrieve("q", "sess", top_k=6, min_score=0.25) == []


def test_build_context_labels_chunks():
    ctx = r.build_context(
        [
            {"content": "Photosynthesis...", "metadata": {"type": "pdf", "page": 4}},
            {"content": "Loops...", "metadata": {"type": "pdf", "page": 7, "filename": "notes.pdf"}},
        ]
    )
    assert "[PDF p.4]" in ctx
    assert "[notes.pdf p.7]" in ctx


def test_retrieve_reranks_when_enabled(monkeypatch):
    from app.rag import retriever as rr
    monkeypatch.setattr(rr, "embed_query", lambda q: [0.0])
    monkeypatch.setattr(
        rr, "match_chunks",
        lambda emb, sid, k: [
            {"content": "weak match", "metadata": {}, "similarity": 0.9},
            {"content": "strong relevant answer", "metadata": {}, "similarity": 0.5},
        ],
    )
    monkeypatch.setattr(
        rr.reranker, "rerank",
        lambda q, hits, top_k: sorted(hits, key=lambda h: len(h["content"]), reverse=True)[:top_k],
    )
    monkeypatch.setattr(rr, "get_settings", lambda: type("S", (), {
        "retrieve_candidates": 20, "rerank_enabled": True})())
    out = rr.retrieve("q", "sess", top_k=1, min_score=0.3)
    assert out[0]["content"] == "strong relevant answer"
