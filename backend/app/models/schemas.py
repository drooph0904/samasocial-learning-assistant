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


class MessageOut(BaseModel):
    role: str
    content: str
    chips: list[dict] = []


class QuizSelection(BaseModel):
    source_id: str
    mcq_count: int = 3
    written_count: int = 2


class QuizRequest(BaseModel):
    session_id: str
    selections: list[QuizSelection]


class GradeRequest(BaseModel):
    quiz_id: str
    answers: dict[str, str]  # question_id -> user answer (mcq: option index as str; written: text)


class HintRequest(BaseModel):
    quiz_id: str
    question_id: str
