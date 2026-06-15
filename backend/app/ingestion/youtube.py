import re

from youtube_transcript_api import YouTubeTranscriptApi

from app.ingestion.base import ParsedSource


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

    def parse(self, ref: str) -> ParsedSource:
        vid = self._video_id(ref)
        try:
            # youtube-transcript-api 1.x: instance .fetch() returns a
            # FetchedTranscript of snippets exposing .text / .start / .duration
            raw = YouTubeTranscriptApi().fetch(vid)
        except Exception as e:  # noqa: BLE001
            raise ValueError(f"No transcript available for this video: {e}")
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
        return ParsedSource(title=f"YouTube {vid}", segments=segments)
