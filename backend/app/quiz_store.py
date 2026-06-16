import threading
import uuid

# In-memory store for generated quizzes. Keeps correct answers server-side (out
# of the browser) and tracks hint usage. Quizzes are ephemeral within a session;
# they do not survive a backend restart (documented limitation).
_store: dict[str, dict] = {}
_lock = threading.Lock()


def hint_budget(num_questions: int) -> int:
    """3 hints for a full test (>=15 questions), otherwise 2."""
    return 3 if num_questions >= 15 else 2


def save_quiz(session_id: str, questions: list[dict]) -> str:
    quiz_id = str(uuid.uuid4())
    with _lock:
        _store[quiz_id] = {
            "session_id": session_id,
            "questions": questions,
            "hints_used": 0,
        }
    return quiz_id


def get_quiz(quiz_id: str) -> dict | None:
    return _store.get(quiz_id)


def use_hint(quiz_id: str) -> int | None:
    """Consume one hint; returns hints remaining after consuming, or None if the
    quiz is missing or no hints are left."""
    with _lock:
        q = _store.get(quiz_id)
        if not q:
            return None
        budget = hint_budget(len(q["questions"]))
        if q["hints_used"] >= budget:
            return None
        q["hints_used"] += 1
        return budget - q["hints_used"]
