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
