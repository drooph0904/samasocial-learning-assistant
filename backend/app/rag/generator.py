from collections.abc import Iterator

from app.config import get_settings
from app.openai_client import get_openai

NO_CONTEXT_REPLY = (
    "I don't have anything about that in the sources you've loaded. "
    "Try rephrasing, or add a source that covers this topic."
)


def build_system_prompt() -> str:
    return (
        "You are a learning assistant that answers ONLY from the provided context. "
        "Each context block is labeled with its source (e.g. [PDF p.4], [Video 3:22], [Slide 3], [Web: Title]). "
        "Rules:\n"
        "- Use only information in the context. Never use outside knowledge.\n"
        "- Always cite the source label(s) you used, inline, e.g. (PDF p.4).\n"
        "- If the answer is not in the context, say you don't have it. Do not guess.\n"
        "- When asked to 'explain simply', simplify but stay grounded in the context."
    )


def stream_answer(question: str, context: str, history: list[dict]) -> Iterator[str]:
    messages = [{"role": "system", "content": build_system_prompt()}]
    for m in history:
        messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"})
    stream = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model, messages=messages, stream=True, temperature=0.2
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
