import io

from app.config import get_settings
from app.openai_client import get_openai


def transcribe_audio(data: bytes, filename: str = "audio.webm") -> str:
    """Transcribe recorded audio bytes to text via OpenAI."""
    buf = io.BytesIO(data)
    buf.name = filename  # the OpenAI SDK uses the name to infer the format
    resp = get_openai().audio.transcriptions.create(
        model=get_settings().openai_transcribe_model,
        file=buf,
    )
    return (resp.text or "").strip()
