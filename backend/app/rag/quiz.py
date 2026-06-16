import json

from app.config import get_settings
from app.openai_client import get_openai


def generate_questions(context: str, n_mcq: int, n_written: int) -> list[dict]:
    """Generate MCQ + written questions strictly from the provided content.

    Returns a list of unified question dicts:
      mcq:     {type, question, options[4], correct_index, explanation}
      written: {type, question, answer, explanation}
    """
    if n_mcq <= 0 and n_written <= 0:
        return []
    resp = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model,
        temperature=0.4,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    f"Generate quiz questions STRICTLY from the provided content. "
                    f"Create exactly {n_mcq} multiple-choice questions and {n_written} short-answer "
                    f"(written) questions.\n"
                    'Return JSON of this exact shape:\n'
                    '{"mcqs":[{"question":"...","options":["a","b","c","d"],'
                    '"correct_index":0,"explanation":"why"}],'
                    '"written":[{"question":"...","answer":"model answer","explanation":"why"}]}\n'
                    "Each MCQ must have exactly 4 plausible options and one correct option "
                    "(correct_index is 0-based). Do not invent facts beyond the content."
                ),
            },
            {"role": "user", "content": context[:8000]},
        ],
    )
    data = json.loads(resp.choices[0].message.content)
    questions: list[dict] = []
    for m in data.get("mcqs", [])[:n_mcq]:
        opts = m.get("options", [])
        if len(opts) < 2:
            continue
        ci = int(m.get("correct_index", 0))
        ci = ci if 0 <= ci < len(opts) else 0
        questions.append(
            {
                "type": "mcq",
                "question": m.get("question", ""),
                "options": opts,
                "correct_index": ci,
                "answer": opts[ci],
                "explanation": m.get("explanation", ""),
            }
        )
    for w in data.get("written", [])[:n_written]:
        questions.append(
            {
                "type": "written",
                "question": w.get("question", ""),
                "answer": w.get("answer", ""),
                "explanation": w.get("explanation", ""),
            }
        )
    return questions


def make_hint(question: str, answer: str) -> str:
    """A one-sentence nudge that guides the learner WITHOUT revealing the answer."""
    resp = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model,
        temperature=0.5,
        messages=[
            {
                "role": "system",
                "content": (
                    "Give a single short hint (one sentence) that nudges the student toward the "
                    "answer WITHOUT stating or directly giving it away. No spoilers."
                ),
            },
            {"role": "user", "content": f"Question: {question}\n(Correct answer, do NOT reveal: {answer})"},
        ],
    )
    return (resp.choices[0].message.content or "").strip()
