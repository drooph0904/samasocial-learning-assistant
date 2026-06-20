import json
import os
import pathlib

import httpx

from app.config import get_settings
from app.ingestion.service import process_source
from app.repository import create_source, ensure_session, update_source

MANIFEST = pathlib.Path(__file__).parent / "corpus_manifest.json"
DEST_DIR = pathlib.Path(__file__).parent.parent / "corpus_pdfs"


def _http_get(url: str) -> bytes:
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        return r.content


def download(entry: dict, dest_dir: str) -> str:
    path = os.path.join(dest_dir, entry["filename"])
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    os.makedirs(dest_dir, exist_ok=True)
    data = _http_get(entry["url"])
    with open(path, "wb") as f:
        f.write(data)
    return path


def main() -> None:
    settings = get_settings()
    corpus_id = settings.corpus_session_id
    ensure_session(corpus_id)
    entries = json.loads(MANIFEST.read_text())
    for entry in entries:
        print(f"[corpus] {entry['filename']} ...")
        path = download(entry, str(DEST_DIR))
        source_id = create_source(corpus_id, "pdf", entry["filename"])
        try:
            process_source(source_id, corpus_id, "pdf", path)
            print(f"[corpus]   ingested {entry['filename']}")
        except Exception as e:  # keep going on a single bad PDF
            update_source(source_id, status="error", error=str(e))
            print(f"[corpus]   FAILED {entry['filename']}: {e}")


if __name__ == "__main__":
    main()
