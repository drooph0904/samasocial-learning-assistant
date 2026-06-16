from collections.abc import Iterator

from app.config import get_settings
from app.openai_client import get_openai

NO_CONTEXT_REPLY = (
    "I don't have anything about that in the sources you've loaded. "
    "Try rephrasing, or add a source that covers this topic."
)


def build_system_prompt() -> str:
    return (
        "You are a learning assistant and tutor. Your job is to answer questions, explain "
        "concepts, and resolve doubts using the provided context. "
        "Each context block is labeled with its source (e.g. [PDF p.4], [Video 3:22], [Slide 3], [Web: Title]). "
        "Rules:\n"
        "- Every FACTUAL claim must come from the context. Never introduce facts, names, "
        "numbers, or events that are not in the context.\n"
        "- You MAY teach: rephrase, simplify, summarize, give everyday analogies, and walk "
        "through reasoning step by step to help the user understand the grounded facts. "
        "Analogies and explanations are encouraged as long as the underlying facts stay grounded.\n"
        "- Always cite the source label(s) the facts came from, inline, e.g. (PDF p.4).\n"
        "- Use the conversation history to understand follow-up questions and resolve doubts.\n"
        "- If the facts needed to answer are genuinely not in the context, say you don't have "
        "that information. Do not invent facts."
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
