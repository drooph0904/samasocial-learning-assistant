import os
import tempfile

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from app.ingestion.service import process_source
from app.models.schemas import (
    CreateSessionResponse,
    SourceOut,
)
from app.repository import (
    create_session,
    create_source,
    delete_session,
    delete_source,
    ensure_session,
    get_source,
    list_sources,
)
from app.util import is_uuid

router = APIRouter(prefix="/api", tags=["sources"])

_ALLOWED_EXT = {".pdf": "pdf"}
_MAX_BYTES = 25 * 1024 * 1024


@router.post("/session", response_model=CreateSessionResponse)
def new_session():
    return CreateSessionResponse(session_id=create_session())


@router.get("/sources", response_model=list[SourceOut])
def get_sources(session_id: str):
    if not is_uuid(session_id):
        return []
    return list_sources(session_id)


@router.get("/session/title")
def session_title(session_id: str):
    if not is_uuid(session_id):
        return {"title": "New chat"}
    sources = list_sources(session_id)
    ready = [s for s in sources if s.get("status") == "ready"]
    title = ready[0]["title"] if ready else (sources[0]["title"] if sources else None)
    return {"title": title or "New chat"}


@router.get("/sources/{source_id}", response_model=SourceOut)
def source_status(source_id: str):
    if not is_uuid(source_id):
        raise HTTPException(404, "source not found")
    src = get_source(source_id)
    if not src:
        raise HTTPException(404, "source not found")
    return src


@router.delete("/sources/{source_id}")
def remove_source(source_id: str):
    if not is_uuid(source_id):
        raise HTTPException(404, "source not found")
    delete_source(source_id)
    return {"deleted": source_id}


@router.delete("/session/{session_id}")
def remove_session(session_id: str):
    if not is_uuid(session_id):
        raise HTTPException(404, "session not found")
    delete_session(session_id)
    return {"deleted": session_id}


@router.post("/sources/file", response_model=SourceOut)
async def add_file_source(
    bg: BackgroundTasks,
    session_id: str = Form(...),
    file: UploadFile = File(...),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(400, ".pdf only")
    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(400, "file too large (max 25MB)")
    ensure_session(session_id)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp.write(data)
    tmp.close()
    type_ = _ALLOWED_EXT[ext]
    sid = create_source(session_id, type_, file.filename)
    bg.add_task(process_source, sid, session_id, type_, tmp.name)
    return get_source(sid)
