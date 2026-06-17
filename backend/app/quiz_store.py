from app import repository
from app.util import is_uuid

# Quizzes are persisted in Supabase (table `quizzes`) so they survive backend
# restarts and work across multiple backend instances. Correct answers stay
# server-side (in the payload), never sent to the client until grading.


def hint_budget(num_questions: int) -> int:
    """3 hints for a full test (>=15 questions), otherwise 2."""
    return 3 if num_questions >= 15 else 2


def save_quiz(session_id: str, questions: list[dict]) -> str:
    return repository.quiz_insert(session_id, {"questions": questions})


def get_quiz(quiz_id: str) -> dict | None:
    if not is_uuid(quiz_id):
        return None
    row = repository.quiz_get(quiz_id)
    if not row:
        return None
    return {
        "session_id": row["session_id"],
        "questions": row["payload"]["questions"],
        "hints_used": row["hints_used"],
    }


def use_hint(quiz_id: str) -> int | None:
    """Consume one hint; returns hints remaining after consuming, or None if the
    quiz is missing or no hints are left."""
    if not is_uuid(quiz_id):
        return None
    row = repository.quiz_get(quiz_id)
    if not row:
        return None
    budget = hint_budget(len(row["payload"]["questions"]))
    if row["hints_used"] >= budget:
        return None
    new_used = row["hints_used"] + 1
    repository.quiz_update_hints(quiz_id, new_used)
    return budget - new_used
