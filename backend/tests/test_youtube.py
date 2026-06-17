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


class _FakeTranscript:
    def __init__(self, lang, snippets, translatable=False, translated=None):
        self.language_code = lang
        self.is_generated = False
        self.is_translatable = translatable
        self._snippets = snippets
        self._translated = translated

    def translate(self, lang):
        if self._translated is None:
            raise Exception("translation not available")
        return self._translated

    def fetch(self):
        return self._snippets


class _FakeTranscriptList:
    def __init__(self, transcripts):
        self._transcripts = transcripts

    def find_transcript(self, codes):
        for code in codes:
            for t in self._transcripts:
                if t.language_code == code:
                    return t
        raise Exception("no transcript found for requested languages")

    def __iter__(self):
        return iter(self._transcripts)


class _FakeApi:
    def __init__(self, transcript_list=None, error=None):
        self._tl = transcript_list
        self._error = error

    def list(self, vid):
        if self._error:
            raise self._error
        return self._tl


def test_youtube_builds_timestamped_segments(monkeypatch):
    fake = [_Snippet("welcome to the course", 0.0), _Snippet("today we cover loops", 202.0)]
    tl = _FakeTranscriptList([_FakeTranscript("en", fake)])
    monkeypatch.setattr(yt, "YouTubeTranscriptApi", lambda: _FakeApi(transcript_list=tl))
    monkeypatch.setattr(yt, "_fetch_title", lambda vid: "My Great Video")
    parsed = YoutubeParser().parse("https://youtu.be/abc12345678")
    assert parsed.segments[0][1] == {"type": "youtube", "start_seconds": 0, "timestamp": "0:00"}
    assert parsed.segments[1][1]["timestamp"] == "3:22"
    assert parsed.segments[0][0] == "welcome to the course"
    assert parsed.title == "My Great Video"  # real title, not the id string


def test_youtube_prefers_english_variant_like_en_in(monkeypatch):
    en_in = [_Snippet("hello friends", 0.0)]
    hi = [_Snippet("namaste", 0.0)]
    # only en-IN and hi available; should pick en-IN (an English variant)
    tl = _FakeTranscriptList(
        [_FakeTranscript("hi", hi, translatable=True), _FakeTranscript("en-IN", en_in)]
    )
    monkeypatch.setattr(yt, "YouTubeTranscriptApi", lambda: _FakeApi(transcript_list=tl))
    monkeypatch.setattr(yt, "_fetch_title", lambda vid: "T")
    parsed = YoutubeParser().parse("https://youtu.be/abc12345678")
    assert parsed.segments[0][0] == "hello friends"


def test_youtube_falls_back_to_available_when_no_english(monkeypatch):
    hi = [_Snippet("namaste doston", 0.0)]
    # no English, translation to en unavailable -> use the transcript as-is
    tl = _FakeTranscriptList([_FakeTranscript("hi", hi, translatable=True, translated=None)])
    monkeypatch.setattr(yt, "YouTubeTranscriptApi", lambda: _FakeApi(transcript_list=tl))
    monkeypatch.setattr(yt, "_fetch_title", lambda vid: "T")
    parsed = YoutubeParser().parse("https://youtu.be/abc12345678")
    assert parsed.segments[0][0] == "namaste doston"


def test_youtube_no_transcript_raises(monkeypatch):
    monkeypatch.setattr(
        yt, "YouTubeTranscriptApi", lambda: _FakeApi(error=Exception("Transcript disabled"))
    )
    with pytest.raises(ValueError, match="transcript"):
        YoutubeParser().parse("https://youtu.be/abc12345678")
