from pydantic import BaseModel


class CreateSessionResponse(BaseModel):
    session_id: str


class SourceOut(BaseModel):
    id: str
    type: str
    title: str | None = None
    summary: str | None = None
    status: str
    error: str | None = None
    created_at: str | None = None


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
