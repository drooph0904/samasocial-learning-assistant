from fastapi import APIRouter, File, HTTPException, UploadFile

from app.transcribe import transcribe_audio

router = APIRouter(prefix="/api", tags=["voice"])

_MAX_BYTES = 25 * 1024 * 1024  # OpenAI audio upload limit


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty audio")
    if len(data) > _MAX_BYTES:
        raise HTTPException(400, "audio too large (max 25MB)")
    try:
        text = transcribe_audio(data, file.filename or "audio.webm")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"transcription failed: {e}")
    return {"text": text}
