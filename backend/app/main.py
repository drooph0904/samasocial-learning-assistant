from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import chat, quiz, sources

app = FastAPI(title="Samasocial Learning Assistant")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(sources.router)
app.include_router(chat.router)
app.include_router(quiz.router)


@app.get("/health")
def health():
    return {"status": "ok"}
