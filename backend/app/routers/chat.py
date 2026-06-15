import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.models.schemas import ChatRequest
from app.rag.citations import chip_for
from app.rag.generator import NO_CONTEXT_REPLY, stream_answer
from app.rag.retriever import build_context, retrieve
from app.repository import add_message, list_messages

router = APIRouter(prefix="/api", tags=["chat"])


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/chat")
def chat(req: ChatRequest):
    s = get_settings()
    add_message(req.session_id, "user", req.message)
    history = list_messages(req.session_id, limit=10)[:-1]  # exclude the just-added user msg
    hits = retrieve(req.message, req.session_id, s.retrieval_top_k, s.retrieval_min_score)

    def gen():
        # de-dup source chips
        seen, chips = set(), []
        for h in hits:
            chip = chip_for(h["metadata"])
            if chip["label"] not in seen:
                seen.add(chip["label"])
                chips.append(chip)
        yield _sse("sources", {"chips": chips})

        if not hits:
            yield _sse("token", {"text": NO_CONTEXT_REPLY})
            add_message(req.session_id, "assistant", NO_CONTEXT_REPLY, [])
            yield _sse("done", {})
            return

        context = build_context(hits)
        collected = []
        for token in stream_answer(req.message, context, history):
            collected.append(token)
            yield _sse("token", {"text": token})
        add_message(req.session_id, "assistant", "".join(collected), chips)
        yield _sse("done", {})

    return StreamingResponse(gen(), media_type="text/event-stream")
