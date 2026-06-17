from app import transcribe as t


def test_transcribe_audio_calls_model(monkeypatch):
    captured = {}

    class FakeTranscriptions:
        def create(self, **kw):
            captured["model"] = kw["model"]
            captured["name"] = kw["file"].name
            return type("R", (), {"text": "  hello world  "})()

    class FakeAudio:
        transcriptions = FakeTranscriptions()

    class FakeClient:
        audio = FakeAudio()

    monkeypatch.setattr(t, "get_openai", lambda: FakeClient())
    out = t.transcribe_audio(b"\x00\x01", "audio.webm")
    assert out == "hello world"  # stripped
    assert captured["name"] == "audio.webm"
