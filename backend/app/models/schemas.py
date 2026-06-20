from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class CreateSessionResponse(BaseModel):
    session_id: str


class SourceOut(BaseModel):
    # psycopg returns native UUID/datetime from the DB; typing them here lets
    # Pydantic accept those values and still serialize to JSON strings for the client.
    id: UUID
    type: str
    title: str | None = None
    summary: str | None = None
    status: str
    error: str | None = None
    created_at: datetime | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str


class MessageOut(BaseModel):
    role: str
    content: str
    chips: list[dict] = []


class RetrieveRequest(BaseModel):
    query: str
    top_k: int = 6


class RetrievedChunk(BaseModel):
    content: str
    filename: str | None = None
    page: int | None = None
    similarity: float | None = None
    rerank_score: float | None = None


class RetrieveResponse(BaseModel):
    results: list[RetrievedChunk]
