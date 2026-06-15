from pydantic import BaseModel


class CreateSessionResponse(BaseModel):
    session_id: str


class AddUrlSourceRequest(BaseModel):
    session_id: str
    type: str  # youtube | webpage
    url: str


class SourceOut(BaseModel):
    id: str
    type: str
    title: str | None = None
    summary: str | None = None
    status: str
    error: str | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str


class QuizRequest(BaseModel):
    session_id: str
    n: int = 5
