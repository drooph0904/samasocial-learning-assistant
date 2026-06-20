from app.config import Settings


def test_new_settings_defaults(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    monkeypatch.setenv("DATABASE_URL", "postgresql://rag:rag@localhost:5432/rag")
    monkeypatch.setenv("CORPUS_SESSION_ID", "00000000-0000-0000-0000-000000000001")
    s = Settings()
    assert s.embed_model == "BAAI/bge-base-en-v1.5"
    assert s.reranker_model == "BAAI/bge-reranker-base"
    assert s.rerank_enabled is True
    assert s.retrieve_candidates == 20
    assert s.retrieval_top_k == 6
    assert s.database_url.startswith("postgresql://")
