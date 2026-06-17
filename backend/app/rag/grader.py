import json

from app.config import get_settings
from app.openai_client import get_openai


def grade_written(question: str, model_answer: str, user_answer: str) -> dict:
    """Grade a free-text answer against the model answer.

    Returns {"verdict": "correct"|"partial"|"incorrect", "feedback": str}.
    """
    if not (user_answer or "").strip():
        return {"verdict": "incorrect", "feedback": "No answer was provided."}
    resp = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You are grading a student's short answer against the model answer. "
                    "Judge meaning, not exact wording. Return JSON: "
                    '{"verdict":"correct|partial|incorrect","feedback":"one or two sentences"}. '
                    "Use 'partial' when the answer is on the right track but incomplete or has a "
                    "minor error. In feedback, briefly say what was right and what to fix."
                ),
            },
            {
                "role": "user",
                "content": f"Question: {question}\nModel answer: {model_answer}\nStudent answer: {user_answer}",
            },
        ],
    )
    data = json.loads(resp.choices[0].message.content)
    verdict = data.get("verdict", "incorrect")
    if verdict not in ("correct", "partial", "incorrect"):
        verdict = "incorrect"
    return {"verdict": verdict, "feedback": data.get("feedback", "")}
