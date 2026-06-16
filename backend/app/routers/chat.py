import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.models.schemas import ChatRequest, MessageOut
from app.rag.citations import chip_for
from app.rag.contextualizer import condense_query
from app.rag.generator import stream_answer
from app.rag.retriever import build_context, retrieve
from app.repository import add_message, list_messages, list_sources

router = APIRouter(prefix="/api", tags=["chat"])


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.get("/messages", response_model=list[MessageOut])
def get_messages(session_id: str):
    # restore a chat when the user switches back to it (or refreshes)
    return [
        {"role": m["role"], "content": m["content"], "chips": m.get("citations") or []}
        for m in list_messages(session_id, limit=200)
    ]


def build_sources_overview(session_id: str) -> str:
    """A short roster of the session's ready sources + summaries, so the model is
    always aware of what's loaded (enables greetings, capability answers, and
    whole-document/overview questions even when chunk retrieval doesn't match)."""
    lines = []
    for src in list_sources(session_id):
        if src.get("status") != "ready":
            continue
        title = src.get("title") or src.get("type")
        summary = (src.get("summary") or "").strip()
        lines.append(f"- ({src['type']}) {title}: {summary}")
    return "\n".join(lines)


@router.post("/chat")
def chat(req: ChatRequest):
    s = get_settings()
    add_message(req.session_id, "user", req.message)
    history = list_messages(req.session_id, limit=10)[:-1]  # exclude the just-added user msg
    # Rewrite follow-ups ("explain simpler", "but why?") into a standalone query
    # using the conversation, so retrieval pulls the right chunks regardless of
    # phrasing. No-op on the first turn.
    search_query = condense_query(history, req.message)
    hits = retrieve(search_query, req.session_id, s.retrieval_top_k, s.retrieval_min_score)
    overview = build_sources_overview(req.session_id)

    # de-dup candidate chips for the retrieved excerpts
    seen, candidate_chips = set(), []
    for h in hits:
        chip = chip_for(h["metadata"])
        if chip["label"] not in seen:
            seen.add(chip["label"])
            candidate_chips.append(chip)

    def gen():
        # Always let the model respond conversationally — it has the session
        # overview even when no excerpts matched, so it can greet, summarize,
        # answer, or ask a clarifying question instead of dead-ending.
        context = build_context(hits)
        collected = []
        for token in stream_answer(req.message, context, history, overview):
            collected.append(token)
            yield _sse("token", {"text": token})
        answer = "".join(collected)

        # Show chips only for sources the answer actually cited (the prompt cites
        # inline, e.g. "(Slide 3)"), so greetings/small talk don't show stray chips.
        used_chips = [c for c in candidate_chips if c["label"] in answer]
        yield _sse("sources", {"chips": used_chips})
        add_message(req.session_id, "assistant", answer, used_chips)
        yield _sse("done", {})

    return StreamingResponse(gen(), media_type="text/event-stream")
