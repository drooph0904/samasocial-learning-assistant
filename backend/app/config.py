from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: str
    openai_chat_model: str = "gpt-4o-mini"
    openai_transcribe_model: str = "whisper-1"

    # Local open-source stack (Challenge 1)
    database_url: str = "postgresql://rag:rag@localhost:5432/rag"
    embed_model: str = "BAAI/bge-base-en-v1.5"
    reranker_model: str = "BAAI/bge-reranker-base"
    rerank_enabled: bool = True
    retrieve_candidates: int = 20
    corpus_session_id: str = "00000000-0000-0000-0000-000000000001"

    retrieval_top_k: int = 6
    retrieval_min_score: float = 0.30
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
