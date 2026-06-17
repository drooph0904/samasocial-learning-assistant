import json

from app.config import get_settings
from app.openai_client import get_openai


def describe_source(text: str, source_type: str = "", title: str = "") -> dict:
    """One call that returns a short headline + a short description for a source.

    Returns {"headline": <3-5 word label>, "summary": <2-3 sentence description>}.
    For videos, the headline is based on the provided video title (shortened);
    for other sources it's derived from the content.
    """
    snippet = text[:6000]
    resp = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model,
        temperature=0.3,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    'Label a study source. Return JSON {"headline":"...","summary":"..."}. '
                    "headline: a concise 3-5 word title in Title Case, no quotes, no trailing "
                    "punctuation. If a source title is given (e.g. a video title), base the headline "
                    "on it, shortened to the key words. "
                    "summary: 2-3 sentences (about 3-4 lines) describing what the source covers."
                ),
            },
            {
                "role": "user",
                "content": f"Source type: {source_type}\nSource title: {title}\n\nContent:\n{snippet}",
            },
        ],
    )
    data = json.loads(resp.choices[0].message.content)
    headline = (data.get("headline") or title or "Source").strip().strip('"').rstrip(".")
    summary = (data.get("summary") or "").strip()
    return {"headline": headline, "summary": summary}


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
