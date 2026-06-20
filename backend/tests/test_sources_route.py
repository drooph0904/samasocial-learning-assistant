import datetime
import uuid

from fastapi.testclient import TestClient

import app.routers.sources as srcmod
from app.main import app


def test_sources_endpoint_serializes_native_db_types(monkeypatch):
    """psycopg returns native UUID/datetime; the /api/sources response must still
    serialize cleanly (regression: SourceOut typed id/created_at as str -> 500)."""
    row = {
        "id": uuid.UUID("946f6a6d-ab1c-4200-a37d-d6b8f4dfc3d1"),
        "session_id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
        "type": "pdf",
        "title": "Structure and Interpretation",
        "summary": None,
        "status": "ready",
        "error": None,
        "created_at": datetime.datetime(2026, 6, 20, 13, 0, 0),
    }
    monkeypatch.setattr(srcmod, "list_sources", lambda sid: [row])
    client = TestClient(app)
    r = client.get("/api/sources?session_id=946f6a6d-ab1c-4200-a37d-d6b8f4dfc3d1")
    assert r.status_code == 200
    body = r.json()[0]
    assert body["id"] == "946f6a6d-ab1c-4200-a37d-d6b8f4dfc3d1"  # UUID -> str
    assert isinstance(body["created_at"], str)  # datetime -> ISO str
    assert body["status"] == "ready"
