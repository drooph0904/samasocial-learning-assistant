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


def test_youtube_builds_timestamped_segments(monkeypatch):
    fake = [
        {"text": "welcome to the course", "start": 0.0},
        {"text": "today we cover loops", "start": 202.0},
    ]
    monkeypatch.setattr(yt.YouTubeTranscriptApi, "get_transcript", lambda vid: fake)
    parsed = YoutubeParser().parse("https://youtu.be/abc12345678")
    assert parsed.segments[0][1] == {"type": "youtube", "start_seconds": 0, "timestamp": "0:00"}
    assert parsed.segments[1][1]["timestamp"] == "3:22"


def test_youtube_no_transcript_raises(monkeypatch):
    def boom(vid):
        raise Exception("Transcript disabled")

    monkeypatch.setattr(yt.YouTubeTranscriptApi, "get_transcript", boom)
    with pytest.raises(ValueError, match="transcript"):
        YoutubeParser().parse("https://youtu.be/abc12345678")
