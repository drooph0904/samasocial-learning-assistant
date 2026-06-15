import pytest

from app.ingestion import youtube as yt
from app.ingestion.youtube import YoutubeParser, format_timestamp


def test_format_timestamp():
    assert format_timestamp(202) == "3:22"
    assert format_timestamp(5) == "0:05"
    assert format_timestamp(3661) == "1:01:01"


def test_extract_video_id():
    assert YoutubeParser._video_id("https://www.youtube.com/watch?v=abc12345678") == "abc12345678"
    assert YoutubeParser._video_id("https://youtu.be/abc12345678") == "abc12345678"


class _Snippet:
    """Mimics a youtube-transcript-api 1.x snippet (text/start/duration attrs)."""

    def __init__(self, text, start):
        self.text = text
        self.start = start
        self.duration = 1.0


class _FakeApi:
    def __init__(self, snippets=None, error=None):
        self._snippets = snippets or []
        self._error = error

    def fetch(self, vid):
        if self._error:
            raise self._error
        return self._snippets


def test_youtube_builds_timestamped_segments(monkeypatch):
    fake = [_Snippet("welcome to the course", 0.0), _Snippet("today we cover loops", 202.0)]
    monkeypatch.setattr(yt, "YouTubeTranscriptApi", lambda: _FakeApi(snippets=fake))
    parsed = YoutubeParser().parse("https://youtu.be/abc12345678")
    assert parsed.segments[0][1] == {"type": "youtube", "start_seconds": 0, "timestamp": "0:00"}
    assert parsed.segments[1][1]["timestamp"] == "3:22"
    assert parsed.segments[0][0] == "welcome to the course"


def test_youtube_no_transcript_raises(monkeypatch):
    monkeypatch.setattr(
        yt, "YouTubeTranscriptApi", lambda: _FakeApi(error=Exception("Transcript disabled"))
    )
    with pytest.raises(ValueError, match="transcript"):
        YoutubeParser().parse("https://youtu.be/abc12345678")
