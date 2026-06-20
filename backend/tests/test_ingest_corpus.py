import json

from scripts import ingest_corpus as ic


def test_manifest_has_at_least_10_entries():
    import pathlib
    p = pathlib.Path(ic.__file__).parent / "corpus_manifest.json"
    entries = json.loads(p.read_text())
    assert len(entries) >= 10
    assert all("filename" in e and "url" in e for e in entries)


def test_download_skips_existing(tmp_path, monkeypatch):
    existing = tmp_path / "a.pdf"
    existing.write_bytes(b"%PDF-1.4 fake")
    called = {"n": 0}
    monkeypatch.setattr(ic, "_http_get", lambda url: called.__setitem__("n", called["n"] + 1) or b"x")
    path = ic.download({"filename": "a.pdf", "url": "http://x"}, str(tmp_path))
    assert path == str(existing)
    assert called["n"] == 0  # not re-downloaded
