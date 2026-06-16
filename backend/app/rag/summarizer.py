from app.config import get_settings
from app.openai_client import get_openai


def summarize_source(text: str) -> str:
    snippet = text[:6000]
    resp = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model,
        temperature=0.3,
        messages=[
            {"role": "system", "content": "Write a 2-3 sentence summary of the following source content."},
            {"role": "user", "content": snippet},
        ],
    )
    return resp.choices[0].message.content.strip()


def title_for_sources(sources: list[dict]) -> str:
    """A short (<=6 word) collective title describing a chat's sources, built
    from their summaries. Falls back to joined titles / 'New chat'."""
    ready = [s for s in sources if s.get("status") == "ready"]
    if not ready:
        return "New chat"
    lines = []
    for s in ready:
        lines.append(f"- {s.get('title') or s.get('type')}: {(s.get('summary') or '').strip()}")
    digest = "\n".join(lines)[:4000]
    resp = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model,
        temperature=0.3,
        messages=[
            {
                "role": "system",
                "content": (
                    "Given the sources loaded in a study session, return a concise title of at most "
                    "6 words capturing what they collectively cover. No quotes, no trailing period."
                ),
            },
            {"role": "user", "content": digest},
        ],
    )
    title = (resp.choices[0].message.content or "").strip().strip('"').rstrip(".")
    return title or ", ".join(s.get("title") or s.get("type") for s in ready)[:60]
