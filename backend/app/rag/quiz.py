import json

from app.config import get_settings
from app.openai_client import get_openai


def generate_quiz(context: str, n: int = 5) -> list[dict]:
    resp = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model,
        temperature=0.4,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    f"Generate {n} quiz questions strictly from the provided content. "
                    'Return JSON: {"questions":[{"question":"...","answer":"..."}]}'
                ),
            },
            {"role": "user", "content": context[:8000]},
        ],
    )
    data = json.loads(resp.choices[0].message.content)
    return data.get("questions", [])
