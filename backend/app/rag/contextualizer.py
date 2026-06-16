from app.config import get_settings
from app.openai_client import get_openai

_SYSTEM = (
    "You rewrite a user's latest message into a single standalone search query for a "
    "retrieval system. Use the conversation to resolve pronouns and references (e.g. "
    "'that', 'it', 'explain again', 'simpler') into an explicit query about the actual "
    "topic. Capture what the user wants to know, not how they phrased it. "
    "Output ONLY the rewritten query, nothing else."
)


def condense_query(history: list[dict], message: str) -> str:
    """Rewrite a follow-up into a self-contained query using prior turns.

    Returns the message unchanged when there is no history (first turn), so the
    initial question stays fast and we avoid a needless LLM call.
    """
    if not history:
        return message
    convo = "\n".join(f"{m['role']}: {m['content']}" for m in history[-6:])
    resp = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model,
        temperature=0,
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": f"Conversation:\n{convo}\n\nLatest message: {message}\n\nStandalone query:"},
        ],
    )
    rewritten = (resp.choices[0].message.content or "").strip()
    return rewritten or message
