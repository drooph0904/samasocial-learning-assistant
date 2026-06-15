from app.rag import retriever as r


def test_retrieve_filters_below_min_score(monkeypatch):
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
            {"content": "Loops...", "metadata": {"type": "youtube", "timestamp": "3:22"}},
        ]
    )
    assert "[PDF p.4]" in ctx
    assert "[Video 3:22]" in ctx
