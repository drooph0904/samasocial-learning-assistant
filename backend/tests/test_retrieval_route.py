from fastapi.testclient import TestClient

import app.routers.retrieval as route
from app.main import app


def test_retrieve_endpoint_returns_scored_results(monkeypatch):
    monkeypatch.setattr(
        route, "retrieve",
        lambda q, sid, k, ms: [
            {"content": "chunk text", "similarity": 0.71, "rerank_score": 4.2,
             "metadata": {"filename": "x.pdf", "page": 12}},
        ],
    )
    client = TestClient(app)
    r = client.post("/retrieve", json={"query": "what is gradient descent", "top_k": 6})
    assert r.status_code == 200
    res = r.json()["results"][0]
    assert res["filename"] == "x.pdf"
    assert res["page"] == 12
    assert res["similarity"] == 0.71
    assert res["rerank_score"] == 4.2
    assert res["content"] == "chunk text"
