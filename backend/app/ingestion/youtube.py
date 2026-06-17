import re

import httpx
from youtube_transcript_api import YouTubeTranscriptApi

from app.ingestion.base import ParsedSource


def _fetch_title(vid: str) -> str:
    """Get the real video title via YouTube's oEmbed endpoint (no API key)."""
    try:
        resp = httpx.get(
            "https://www.youtube.com/oembed",
            params={"url": f"https://www.youtube.com/watch?v={vid}", "format": "json"},
            timeout=15,
            follow_redirects=True,
        )
        if resp.status_code == 200:
            title = (resp.json().get("title") or "").strip()
            if title:
                return title
    except Exception:  # noqa: BLE001
        pass
    return f"YouTube {vid}"


def format_timestamp(seconds: int) -> str:
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


class YoutubeParser:
    @staticmethod
    def _video_id(url: str) -> str:
        m = re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", url)
        if not m:
            m = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]+)", url)
        if not m:
            raise ValueError("Could not parse a YouTube video id from URL")
        return m.group(1)

    # English variants to prefer, in priority order
    _EN_CODES = ["en", "en-US", "en-GB", "en-IN", "en-AU", "en-CA"]

    @classmethod
    def _pick_transcript(cls, transcript_list):
        """Pick the best transcript: prefer an English variant; else translate a
        translatable one to English; else fall back to whatever exists (other
        languages are fine — the LLM handles them)."""
        try:
            return transcript_list.find_transcript(cls._EN_CODES)
        except Exception:  # noqa: BLE001
            pass
        available = list(transcript_list)
        if not available:
            raise ValueError("No transcript available for this video")
        chosen = available[0]
        if getattr(chosen, "is_translatable", False):
            try:
                return chosen.translate("en")
            except Exception:  # noqa: BLE001
                pass
        return chosen

    def parse(self, ref: str) -> ParsedSource:
        vid = self._video_id(ref)
        try:
            # youtube-transcript-api 1.x: list() returns a TranscriptList we can
            # search by language; the chosen transcript's .fetch() yields snippets
            # exposing .text / .start / .duration
            transcript_list = YouTubeTranscriptApi().list(vid)
            raw = self._pick_transcript(transcript_list).fetch()
        except Exception:  # noqa: BLE001
            # Friendly, actionable message — surfaced on the source card. The most
            # common cause in production is YouTube blocking transcript requests
            # from hosted/datacenter IPs; locally it usually works.
            raise ValueError(
                "Couldn't fetch this video's captions. YouTube often blocks "
                "automated transcript access from hosted servers, or this video "
                "may have no captions. Try a different video, or add YouTube "
                "sources while running the app locally. PDF, slides, and web "
                "pages are unaffected."
            )
        segments: list[tuple[str, dict]] = []
        for item in raw:
            start = int(item.start)
            segments.append(
                (
                    item.text,
                    {"type": "youtube", "start_seconds": start, "timestamp": format_timestamp(start)},
                )
            )
        if not segments:
            raise ValueError("Video transcript was empty")
        return ParsedSource(title=_fetch_title(vid), segments=segments)
