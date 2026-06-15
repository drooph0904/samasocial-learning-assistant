# Multi-Source AI Learning Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web chatbot that ingests YouTube/PDF/PPTX/webpage sources into a pgvector index and answers questions grounded strictly in that content, with streaming, session memory, citations, and three bonus features.

**Architecture:** Two services — FastAPI backend (ingestion, RAG, persistence) and Next.js frontend (split-panel UI, SSE streaming). All parsers emit a uniform `Chunk{content, metadata}`; chunks are embedded with OpenAI and stored in Supabase Postgres + pgvector, scoped by session. Retrieval injects source-labeled context so the model can cite "PDF p.4" / "video 3:22".

**Tech Stack:** FastAPI · Python 3.13 · Next.js (App Router, TS) · Supabase Postgres + pgvector · OpenAI (`gpt-4o-mini`, `text-embedding-3-small`) · pytest

---

## Phase 0 — Backend scaffold & config

### Task 0.1: Python project skeleton

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/pytest.ini`

- [ ] **Step 1: Create `requirements.txt`**

```
fastapi==0.115.*
uvicorn[standard]==0.32.*
pydantic==2.*
pydantic-settings==2.*
python-multipart==0.0.*
openai==1.*
supabase==2.*
tiktoken==0.8.*
pymupdf==1.24.*
python-pptx==1.0.*
youtube-transcript-api==0.6.*
trafilatura==1.12.*
beautifulsoup4==4.12.*
httpx==0.27.*
pytest==8.*
pytest-asyncio==0.24.*
```

- [ ] **Step 2: Create `.env.example`**

```
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBED_MODEL=text-embedding-3-small
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
RETRIEVAL_TOP_K=6
RETRIEVAL_MIN_SCORE=0.25
CORS_ORIGINS=http://localhost:3000
```

- [ ] **Step 3: Create `app/config.py`**

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: str
    openai_chat_model: str = "gpt-4o-mini"
    openai_embed_model: str = "text-embedding-3-small"
    supabase_url: str = ""
    supabase_service_key: str = ""
    retrieval_top_k: int = 6
    retrieval_min_score: float = 0.25
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 4: Create `app/__init__.py` (empty) and `pytest.ini`**

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
pythonpath = .
```

- [ ] **Step 5: Create venv and install**

Run: `cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt`
Expected: installs without error.

- [ ] **Step 6: Commit**

```bash
git add backend/ && git commit -m "chore: backend scaffold and config"
```

---

## Phase 1 — Ingestion core (TDD)

### Task 1.1: Chunk model & token chunker

**Files:**
- Create: `backend/app/ingestion/__init__.py`
- Create: `backend/app/ingestion/base.py`
- Create: `backend/app/ingestion/chunker.py`
- Test: `backend/tests/test_chunker.py`

- [ ] **Step 1: Write `base.py` (the shared abstraction)**

```python
from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class Chunk:
    content: str
    metadata: dict = field(default_factory=dict)


@dataclass
class ParsedSource:
    title: str
    # segments: list of (text, metadata) emitted by a parser before chunking
    segments: list[tuple[str, dict]]


class Parser(Protocol):
    def parse(self, ref: str) -> ParsedSource: ...
```

- [ ] **Step 2: Write the failing test `tests/test_chunker.py`**

```python
from app.ingestion.base import Chunk
from app.ingestion.chunker import chunk_segments


def test_short_segment_becomes_single_chunk():
    chunks = chunk_segments([("hello world", {"page": 1})], max_tokens=500, overlap=0)
    assert len(chunks) == 1
    assert chunks[0].content == "hello world"
    assert chunks[0].metadata["page"] == 1


def test_long_text_splits_into_multiple_chunks_with_metadata_preserved():
    text = " ".join(["word"] * 2000)
    chunks = chunk_segments([(text, {"page": 7})], max_tokens=100, overlap=10)
    assert len(chunks) > 1
    assert all(c.metadata["page"] == 7 for c in chunks)


def test_overlap_repeats_tail_tokens():
    text = " ".join(str(i) for i in range(300))
    chunks = chunk_segments([(text, {})], max_tokens=100, overlap=20)
    # consecutive chunks should share some tokens due to overlap
    assert chunks[0].content.split()[-1] in chunks[1].content.split()[:25]
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && . .venv/bin/activate && pytest tests/test_chunker.py -v`
Expected: FAIL (module `chunker` not found).

- [ ] **Step 4: Implement `chunker.py`**

```python
import tiktoken
from app.ingestion.base import Chunk

_enc = tiktoken.get_encoding("cl100k_base")


def chunk_segments(
    segments: list[tuple[str, dict]],
    max_tokens: int = 500,
    overlap: int = 50,
) -> list[Chunk]:
    """Token-chunk each segment independently so source metadata stays attached."""
    chunks: list[Chunk] = []
    for text, meta in segments:
        text = (text or "").strip()
        if not text:
            continue
        tokens = _enc.encode(text)
        if len(tokens) <= max_tokens:
            chunks.append(Chunk(content=text, metadata=dict(meta)))
            continue
        start = 0
        while start < len(tokens):
            window = tokens[start : start + max_tokens]
            chunks.append(Chunk(content=_enc.decode(window), metadata=dict(meta)))
            if start + max_tokens >= len(tokens):
                break
            start += max_tokens - overlap
    return chunks
```

- [ ] **Step 5: Run to verify pass**

Run: `pytest tests/test_chunker.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/ingestion backend/tests/test_chunker.py
git commit -m "feat: token chunker with metadata preservation"
```

### Task 1.2: PDF parser

**Files:**
- Create: `backend/app/ingestion/pdf.py`
- Test: `backend/tests/test_pdf.py`
- Create fixture: `backend/tests/fixtures/sample.pdf` (generate in Step 1)

- [ ] **Step 1: Generate a 2-page fixture PDF**

```bash
cd backend && . .venv/bin/activate && python -c "
import fitz, os
os.makedirs('tests/fixtures', exist_ok=True)
doc = fitz.open()
p1 = doc.new_page(); p1.insert_text((72,72), 'Photosynthesis converts light into energy.')
p2 = doc.new_page(); p2.insert_text((72,72), 'Mitochondria are the powerhouse of the cell.')
doc.save('tests/fixtures/sample.pdf')
"
```

- [ ] **Step 2: Write failing test `tests/test_pdf.py`**

```python
from app.ingestion.pdf import PdfParser


def test_pdf_extracts_text_per_page():
    parsed = PdfParser().parse("tests/fixtures/sample.pdf")
    assert len(parsed.segments) == 2
    assert "Photosynthesis" in parsed.segments[0][0]
    assert parsed.segments[0][1] == {"type": "pdf", "page": 1}
    assert parsed.segments[1][1]["page"] == 2


def test_pdf_empty_raises():
    import fitz, tempfile, os, pytest
    path = os.path.join(tempfile.mkdtemp(), "blank.pdf")
    d = fitz.open(); d.new_page(); d.save(path)
    with pytest.raises(ValueError, match="no extractable text"):
        PdfParser().parse(path)
```

- [ ] **Step 3: Run to verify it fails**

Run: `pytest tests/test_pdf.py -v` — Expected: FAIL (no module).

- [ ] **Step 4: Implement `pdf.py`**

```python
import os
import fitz
from app.ingestion.base import ParsedSource


class PdfParser:
    def parse(self, ref: str) -> ParsedSource:
        doc = fitz.open(ref)
        segments: list[tuple[str, dict]] = []
        for i, page in enumerate(doc, start=1):
            text = page.get_text().strip()
            if text:
                segments.append((text, {"type": "pdf", "page": i}))
        if not segments:
            raise ValueError("PDF has no extractable text (scanned/image PDFs need OCR)")
        title = os.path.basename(ref)
        return ParsedSource(title=title, segments=segments)
```

- [ ] **Step 5: Run to verify pass** — Run: `pytest tests/test_pdf.py -v` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/ingestion/pdf.py backend/tests/test_pdf.py backend/tests/fixtures/sample.pdf
git commit -m "feat: PDF parser with page metadata"
```

### Task 1.3: PPTX parser

**Files:**
- Create: `backend/app/ingestion/pptx.py`
- Test: `backend/tests/test_pptx.py`

- [ ] **Step 1: Generate fixture + write failing test `tests/test_pptx.py`**

```python
import os
from pptx import Presentation
from pptx.util import Inches
from app.ingestion.pptx import PptxParser


def _make_fixture(path):
    prs = Presentation()
    for text in ["Intro to Algebra", "Solving for x"]:
        slide = prs.slides.add_slide(prs.slide_layouts[5])
        box = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(5), Inches(1))
        box.text_frame.text = text
    prs.save(path)


def test_pptx_extracts_text_per_slide(tmp_path):
    path = os.path.join(tmp_path, "deck.pptx")
    _make_fixture(path)
    parsed = PptxParser().parse(path)
    assert len(parsed.segments) == 2
    assert "Algebra" in parsed.segments[0][0]
    assert parsed.segments[0][1] == {"type": "pptx", "slide": 1}
    assert parsed.segments[1][1]["slide"] == 2
```

- [ ] **Step 2: Run to verify it fails** — `pytest tests/test_pptx.py -v` — Expected: FAIL.

- [ ] **Step 3: Implement `pptx.py`**

```python
import os
from pptx import Presentation
from app.ingestion.base import ParsedSource


class PptxParser:
    def parse(self, ref: str) -> ParsedSource:
        prs = Presentation(ref)
        segments: list[tuple[str, dict]] = []
        for i, slide in enumerate(prs.slides, start=1):
            texts = [s.text_frame.text for s in slide.shapes if s.has_text_frame]
            joined = "\n".join(t for t in texts if t.strip())
            if joined.strip():
                segments.append((joined, {"type": "pptx", "slide": i}))
        if not segments:
            raise ValueError("PPTX has no extractable text")
        return ParsedSource(title=os.path.basename(ref), segments=segments)
```

- [ ] **Step 4: Run to verify pass** — `pytest tests/test_pptx.py -v` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/ingestion/pptx.py backend/tests/test_pptx.py
git commit -m "feat: PPTX parser with slide metadata"
```

### Task 1.4: YouTube parser (timestamped)

**Files:**
- Create: `backend/app/ingestion/youtube.py`
- Test: `backend/tests/test_youtube.py`

- [ ] **Step 1: Write failing test (mock the transcript API) `tests/test_youtube.py`**

```python
import pytest
from app.ingestion import youtube as yt
from app.ingestion.youtube import YoutubeParser, format_timestamp


def test_format_timestamp():
    assert format_timestamp(202) == "3:22"
    assert format_timestamp(5) == "0:05"
    assert format_timestamp(3661) == "1:01:01"


def test_extract_video_id():
    assert YoutubeParser._video_id("https://www.youtube.com/watch?v=abc123") == "abc123"
    assert YoutubeParser._video_id("https://youtu.be/abc123") == "abc123"


def test_youtube_builds_timestamped_segments(monkeypatch):
    fake = [
        {"text": "welcome to the course", "start": 0.0},
        {"text": "today we cover loops", "start": 202.0},
    ]
    monkeypatch.setattr(yt.YouTubeTranscriptApi, "get_transcript", lambda vid: fake)
    parsed = YoutubeParser().parse("https://youtu.be/abc123")
    assert parsed.segments[0][1] == {"type": "youtube", "start_seconds": 0, "timestamp": "0:00"}
    assert parsed.segments[1][1]["timestamp"] == "3:22"


def test_youtube_no_transcript_raises(monkeypatch):
    def boom(vid):
        raise Exception("Transcript disabled")
    monkeypatch.setattr(yt.YouTubeTranscriptApi, "get_transcript", boom)
    with pytest.raises(ValueError, match="transcript"):
        YoutubeParser().parse("https://youtu.be/abc123")
```

- [ ] **Step 2: Run to verify it fails** — `pytest tests/test_youtube.py -v` — Expected: FAIL.

- [ ] **Step 3: Implement `youtube.py`**

```python
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
            raw = YouTubeTranscriptApi.get_transcript(vid)
        except Exception as e:  # noqa: BLE001
            raise ValueError(f"No transcript available for this video: {e}")
        segments: list[tuple[str, dict]] = []
        for item in raw:
            start = int(item["start"])
            segments.append(
                (item["text"], {"type": "youtube", "start_seconds": start, "timestamp": format_timestamp(start)})
            )
        if not segments:
            raise ValueError("Video transcript was empty")
        return ParsedSource(title=f"YouTube {vid}", segments=segments)
```

- [ ] **Step 4: Run to verify pass** — `pytest tests/test_youtube.py -v` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/ingestion/youtube.py backend/tests/test_youtube.py
git commit -m "feat: YouTube transcript parser with timestamps"
```

### Task 1.5: Webpage parser

**Files:**
- Create: `backend/app/ingestion/webpage.py`
- Test: `backend/tests/test_webpage.py`

- [ ] **Step 1: Write failing test `tests/test_webpage.py`**

```python
import pytest
from app.ingestion import webpage as wp
from app.ingestion.webpage import WebpageParser

HTML = """
<html><head><title>Intro to Graphs</title></head>
<body><article><h1>Graphs</h1><p>A graph is a set of nodes and edges.</p></article></body></html>
"""


def test_webpage_extracts_main_text(monkeypatch):
    monkeypatch.setattr(wp, "_fetch_html", lambda url: HTML)
    parsed = WebpageParser().parse("https://example.com/graphs")
    assert parsed.title == "Intro to Graphs"
    assert "nodes and edges" in parsed.segments[0][0]
    assert parsed.segments[0][1]["type"] == "webpage"
    assert parsed.segments[0][1]["url"] == "https://example.com/graphs"


def test_webpage_empty_raises(monkeypatch):
    monkeypatch.setattr(wp, "_fetch_html", lambda url: "<html><body></body></html>")
    with pytest.raises(ValueError, match="content"):
        WebpageParser().parse("https://example.com/empty")
```

- [ ] **Step 2: Run to verify it fails** — `pytest tests/test_webpage.py -v` — Expected: FAIL.

- [ ] **Step 3: Implement `webpage.py`**

```python
import httpx
import trafilatura
from bs4 import BeautifulSoup
from app.ingestion.base import ParsedSource


def _fetch_html(url: str) -> str:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; SamaBot/1.0)"}
    resp = httpx.get(url, headers=headers, timeout=20, follow_redirects=True)
    resp.raise_for_status()
    return resp.text


class WebpageParser:
    def parse(self, ref: str) -> ParsedSource:
        html = _fetch_html(ref)
        text = trafilatura.extract(html) or ""
        soup = BeautifulSoup(html, "html.parser")
        title = (soup.title.string.strip() if soup.title and soup.title.string else ref)
        if not text.strip():
            # fallback to paragraph text
            text = "\n".join(p.get_text(" ", strip=True) for p in soup.find_all("p"))
        if not text.strip():
            raise ValueError("Could not extract readable content from the page")
        return ParsedSource(title=title, segments=[(text, {"type": "webpage", "url": ref, "title": title})])
```

- [ ] **Step 4: Run to verify pass** — `pytest tests/test_webpage.py -v` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/ingestion/webpage.py backend/tests/test_webpage.py
git commit -m "feat: webpage parser with trafilatura + fallback"
```

### Task 1.6: Citation label formatter

**Files:**
- Create: `backend/app/rag/__init__.py`
- Create: `backend/app/rag/citations.py`
- Test: `backend/tests/test_citations.py`

- [ ] **Step 1: Write failing test `tests/test_citations.py`**

```python
from app.rag.citations import label_for, chip_for


def test_label_for_each_type():
    assert label_for({"type": "pdf", "page": 4}) == "PDF p.4"
    assert label_for({"type": "pptx", "slide": 3}) == "Slide 3"
    assert label_for({"type": "youtube", "timestamp": "3:22"}) == "Video 3:22"
    assert label_for({"type": "webpage", "title": "Graphs"}) == "Web: Graphs"


def test_chip_for_includes_icon():
    chip = chip_for({"type": "youtube", "timestamp": "3:22"})
    assert chip["label"] == "Video 3:22"
    assert chip["icon"] == "video"
```

- [ ] **Step 2: Run to verify it fails** — `pytest tests/test_citations.py -v` — Expected: FAIL.

- [ ] **Step 3: Implement `citations.py`**

```python
_ICONS = {"pdf": "file", "pptx": "slides", "youtube": "video", "webpage": "globe"}


def label_for(meta: dict) -> str:
    t = meta.get("type")
    if t == "pdf":
        return f"PDF p.{meta.get('page')}"
    if t == "pptx":
        return f"Slide {meta.get('slide')}"
    if t == "youtube":
        return f"Video {meta.get('timestamp')}"
    if t == "webpage":
        return f"Web: {meta.get('title') or meta.get('url')}"
    return "Source"


def chip_for(meta: dict) -> dict:
    return {"label": label_for(meta), "icon": _ICONS.get(meta.get("type"), "file")}
```

- [ ] **Step 4: Run to verify pass** — `pytest tests/test_citations.py -v` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/rag/__init__.py backend/app/rag/citations.py backend/tests/test_citations.py
git commit -m "feat: citation label + chip formatting"
```

---

## Phase 2 — Supabase schema

### Task 2.1: SQL migration

**Files:**
- Create: `backend/sql/schema.sql`

- [ ] **Step 1: Write `schema.sql`**

```sql
create extension if not exists vector;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  type text not null,
  title text,
  summary text,
  status text not null default 'processing',
  error text,
  created_at timestamptz default now()
);

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  source_id uuid references sources(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb
);
create index if not exists chunks_session_idx on chunks(session_id);
create index if not exists chunks_embedding_idx on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  role text not null,
  content text not null,
  citations jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create or replace function match_chunks(
  query_embedding vector(1536),
  p_session_id uuid,
  match_count int default 6
)
returns table (id uuid, source_id uuid, content text, metadata jsonb, similarity float)
language sql stable as $$
  select c.id, c.source_id, c.content, c.metadata,
         1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.session_id = p_session_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
```

- [ ] **Step 2: Apply it** — Paste into Supabase SQL editor and run (the build operator will be guided through this). Verify tables exist under Table Editor.

- [ ] **Step 3: Commit**

```bash
git add backend/sql/schema.sql && git commit -m "feat: supabase schema with pgvector + match_chunks"
```

### Task 2.2: Supabase client + repository

**Files:**
- Create: `backend/app/db.py`
- Create: `backend/app/repository.py`

- [ ] **Step 1: Implement `db.py`**

```python
from functools import lru_cache
from supabase import create_client, Client
from app.config import get_settings


@lru_cache
def get_db() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_key)
```

- [ ] **Step 2: Implement `repository.py` (thin data-access layer)**

```python
from app.db import get_db


def create_session() -> str:
    res = get_db().table("sessions").insert({}).execute()
    return res.data[0]["id"]


def ensure_session(session_id: str) -> str:
    db = get_db()
    existing = db.table("sessions").select("id").eq("id", session_id).execute()
    if not existing.data:
        db.table("sessions").insert({"id": session_id}).execute()
    return session_id


def create_source(session_id: str, type_: str, title: str) -> str:
    res = get_db().table("sources").insert(
        {"session_id": session_id, "type": type_, "title": title, "status": "processing"}
    ).execute()
    return res.data[0]["id"]


def update_source(source_id: str, **fields) -> None:
    get_db().table("sources").update(fields).eq("id", source_id).execute()


def list_sources(session_id: str) -> list[dict]:
    return get_db().table("sources").select("*").eq("session_id", session_id).order("created_at").execute().data


def get_source(source_id: str) -> dict | None:
    res = get_db().table("sources").select("*").eq("id", source_id).execute()
    return res.data[0] if res.data else None


def insert_chunks(rows: list[dict]) -> None:
    if rows:
        get_db().table("chunks").insert(rows).execute()


def match_chunks(query_embedding: list[float], session_id: str, k: int) -> list[dict]:
    return get_db().rpc(
        "match_chunks",
        {"query_embedding": query_embedding, "p_session_id": session_id, "match_count": k},
    ).execute().data


def add_message(session_id: str, role: str, content: str, citations: list | None = None) -> None:
    get_db().table("messages").insert(
        {"session_id": session_id, "role": role, "content": content, "citations": citations or []}
    ).execute()


def list_messages(session_id: str, limit: int = 20) -> list[dict]:
    return (
        get_db().table("messages").select("*").eq("session_id", session_id)
        .order("created_at", desc=True).limit(limit).execute().data
    )[::-1]
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/db.py backend/app/repository.py
git commit -m "feat: supabase client + repository layer"
```

---

## Phase 3 — RAG layer

### Task 3.1: Embeddings

**Files:**
- Create: `backend/app/openai_client.py`
- Create: `backend/app/rag/embeddings.py`
- Test: `backend/tests/test_embeddings.py`

- [ ] **Step 1: Implement `openai_client.py`**

```python
from functools import lru_cache
from openai import OpenAI
from app.config import get_settings


@lru_cache
def get_openai() -> OpenAI:
    return OpenAI(api_key=get_settings().openai_api_key)
```

- [ ] **Step 2: Write failing test `tests/test_embeddings.py` (mock OpenAI)**

```python
from app.rag import embeddings as emb


def test_embed_texts_returns_vectors(monkeypatch):
    class FakeResp:
        data = [type("D", (), {"embedding": [0.1, 0.2]})(), type("D", (), {"embedding": [0.3, 0.4]})()]

    class FakeEmb:
        def create(self, **kw):
            return FakeResp()

    class FakeClient:
        embeddings = FakeEmb()

    monkeypatch.setattr(emb, "get_openai", lambda: FakeClient())
    out = emb.embed_texts(["a", "b"])
    assert out == [[0.1, 0.2], [0.3, 0.4]]
```

- [ ] **Step 3: Run to verify it fails** — `pytest tests/test_embeddings.py -v` — Expected: FAIL.

- [ ] **Step 4: Implement `embeddings.py`**

```python
from app.openai_client import get_openai
from app.config import get_settings


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    resp = get_openai().embeddings.create(model=get_settings().openai_embed_model, input=texts)
    return [d.embedding for d in resp.data]


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]
```

- [ ] **Step 5: Run to verify pass** — `pytest tests/test_embeddings.py -v` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/openai_client.py backend/app/rag/embeddings.py backend/tests/test_embeddings.py
git commit -m "feat: OpenAI embeddings wrapper"
```

### Task 3.2: Retriever with out-of-scope guard

**Files:**
- Create: `backend/app/rag/retriever.py`
- Test: `backend/tests/test_retriever.py`

- [ ] **Step 1: Write failing test `tests/test_retriever.py`**

```python
from app.rag import retriever as r


def test_retrieve_filters_below_min_score(monkeypatch):
    monkeypatch.setattr(r, "embed_query", lambda q: [0.0])
    monkeypatch.setattr(r, "match_chunks", lambda emb, sid, k: [
        {"content": "good", "metadata": {"type": "pdf", "page": 1}, "similarity": 0.8},
        {"content": "weak", "metadata": {"type": "pdf", "page": 2}, "similarity": 0.1},
    ])
    hits = r.retrieve("q", "sess", top_k=6, min_score=0.25)
    assert len(hits) == 1
    assert hits[0]["content"] == "good"


def test_retrieve_empty_when_all_weak(monkeypatch):
    monkeypatch.setattr(r, "embed_query", lambda q: [0.0])
    monkeypatch.setattr(r, "match_chunks", lambda emb, sid, k: [
        {"content": "weak", "metadata": {}, "similarity": 0.05},
    ])
    assert r.retrieve("q", "sess", top_k=6, min_score=0.25) == []


def test_build_context_labels_chunks():
    ctx = r.build_context([
        {"content": "Photosynthesis...", "metadata": {"type": "pdf", "page": 4}},
        {"content": "Loops...", "metadata": {"type": "youtube", "timestamp": "3:22"}},
    ])
    assert "[PDF p.4]" in ctx
    assert "[Video 3:22]" in ctx
```

- [ ] **Step 2: Run to verify it fails** — `pytest tests/test_retriever.py -v` — Expected: FAIL.

- [ ] **Step 3: Implement `retriever.py`**

```python
from app.rag.embeddings import embed_query
from app.rag.citations import label_for
from app.repository import match_chunks


def retrieve(query: str, session_id: str, top_k: int, min_score: float) -> list[dict]:
    emb = embed_query(query)
    hits = match_chunks(emb, session_id, top_k)
    return [h for h in hits if h.get("similarity", 0) >= min_score]


def build_context(hits: list[dict]) -> str:
    blocks = []
    for h in hits:
        blocks.append(f"[{label_for(h['metadata'])}]\n{h['content']}")
    return "\n\n".join(blocks)
```

- [ ] **Step 4: Run to verify pass** — `pytest tests/test_retriever.py -v` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/rag/retriever.py backend/tests/test_retriever.py
git commit -m "feat: retriever with out-of-scope score guard + labeled context"
```

### Task 3.3: Generator (streaming) + prompt

**Files:**
- Create: `backend/app/rag/generator.py`
- Test: `backend/tests/test_generator.py`

- [ ] **Step 1: Write failing test `tests/test_generator.py`**

```python
from app.rag import generator as g


def test_system_prompt_demands_grounding():
    p = g.build_system_prompt()
    assert "only" in p.lower()
    assert "cite" in p.lower()


def test_no_context_message():
    assert "don't have" in g.NO_CONTEXT_REPLY.lower() or "not" in g.NO_CONTEXT_REPLY.lower()


def test_stream_answer_yields_tokens(monkeypatch):
    class Chunk:
        def __init__(self, t):
            self.choices = [type("C", (), {"delta": type("D", (), {"content": t})()})()]

    class FakeCompletions:
        def create(self, **kw):
            return iter([Chunk("Hel"), Chunk("lo"), Chunk(None)])

    class FakeChat:
        completions = FakeCompletions()

    class FakeClient:
        chat = FakeChat()

    monkeypatch.setattr(g, "get_openai", lambda: FakeClient())
    out = "".join(g.stream_answer("q", "ctx", []))
    assert out == "Hello"
```

- [ ] **Step 2: Run to verify it fails** — `pytest tests/test_generator.py -v` — Expected: FAIL.

- [ ] **Step 3: Implement `generator.py`**

```python
from collections.abc import Iterator
from app.openai_client import get_openai
from app.config import get_settings

NO_CONTEXT_REPLY = (
    "I don't have anything about that in the sources you've loaded. "
    "Try rephrasing, or add a source that covers this topic."
)


def build_system_prompt() -> str:
    return (
        "You are a learning assistant that answers ONLY from the provided context. "
        "Each context block is labeled with its source (e.g. [PDF p.4], [Video 3:22], [Slide 3], [Web: Title]). "
        "Rules:\n"
        "- Use only information in the context. Never use outside knowledge.\n"
        "- Always cite the source label(s) you used, inline, e.g. (PDF p.4).\n"
        "- If the answer is not in the context, say you don't have it. Do not guess.\n"
        "- When asked to 'explain simply', simplify but stay grounded in the context."
    )


def stream_answer(question: str, context: str, history: list[dict]) -> Iterator[str]:
    messages = [{"role": "system", "content": build_system_prompt()}]
    for m in history:
        messages.append({"role": m["role"], "content": m["content"]})
    messages.append(
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"}
    )
    stream = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model, messages=messages, stream=True, temperature=0.2
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
```

- [ ] **Step 4: Run to verify pass** — `pytest tests/test_generator.py -v` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/rag/generator.py backend/tests/test_generator.py
git commit -m "feat: streaming grounded answer generator"
```

### Task 3.4: Summarizer + Quiz

**Files:**
- Create: `backend/app/rag/summarizer.py`
- Create: `backend/app/rag/quiz.py`
- Test: `backend/tests/test_summarizer.py`

- [ ] **Step 1: Write failing test `tests/test_summarizer.py`**

```python
from app.rag import summarizer as s
from app.rag import quiz as q


def test_summarize_calls_model(monkeypatch):
    captured = {}

    class FakeCompletions:
        def create(self, **kw):
            captured["msgs"] = kw["messages"]
            return type("R", (), {"choices": [type("C", (), {"message": type("M", (), {"content": "A short summary."})()})()]})()

    class FakeClient:
        chat = type("Chat", (), {"completions": FakeCompletions()})()

    monkeypatch.setattr(s, "get_openai", lambda: FakeClient())
    out = s.summarize_source("Some long text about cells")
    assert out == "A short summary."
    assert "summary" in captured["msgs"][0]["content"].lower()


def test_quiz_parses_json(monkeypatch):
    payload = '{"questions":[{"question":"What is a cell?","answer":"Basic unit of life"}]}'

    class FakeCompletions:
        def create(self, **kw):
            return type("R", (), {"choices": [type("C", (), {"message": type("M", (), {"content": payload})()})()]})()

    class FakeClient:
        chat = type("Chat", (), {"completions": FakeCompletions()})()

    monkeypatch.setattr(q, "get_openai", lambda: FakeClient())
    out = q.generate_quiz("context text", n=1)
    assert out[0]["question"] == "What is a cell?"
```

- [ ] **Step 2: Run to verify it fails** — `pytest tests/test_summarizer.py -v` — Expected: FAIL.

- [ ] **Step 3: Implement `summarizer.py`**

```python
from app.openai_client import get_openai
from app.config import get_settings


def summarize_source(text: str) -> str:
    snippet = text[:6000]
    resp = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model,
        temperature=0.3,
        messages=[
            {"role": "system", "content": "Write a 2-3 sentence summary of the following source content."},
            {"role": "user", "content": snippet},
        ],
    )
    return resp.choices[0].message.content.strip()
```

- [ ] **Step 4: Implement `quiz.py`**

```python
import json
from app.openai_client import get_openai
from app.config import get_settings


def generate_quiz(context: str, n: int = 5) -> list[dict]:
    resp = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model,
        temperature=0.4,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": (
                f"Generate {n} quiz questions strictly from the provided content. "
                'Return JSON: {"questions":[{"question":"...","answer":"..."}]}'
            )},
            {"role": "user", "content": context[:8000]},
        ],
    )
    data = json.loads(resp.choices[0].message.content)
    return data.get("questions", [])
```

- [ ] **Step 5: Run to verify pass** — `pytest tests/test_summarizer.py -v` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/rag/summarizer.py backend/app/rag/quiz.py backend/tests/test_summarizer.py
git commit -m "feat: per-source summarizer + quiz generator"
```

### Task 3.5: Ingestion service (wires parsers → chunks → embeddings → db)

**Files:**
- Create: `backend/app/ingestion/service.py`
- Test: `backend/tests/test_ingestion_service.py`

- [ ] **Step 1: Write failing test `tests/test_ingestion_service.py`**

```python
from app.ingestion import service as svc
from app.ingestion.base import ParsedSource


def test_process_source_stores_chunks_and_summary(monkeypatch):
    calls = {}
    parsed = ParsedSource(title="Doc", segments=[("hello world " * 50, {"type": "pdf", "page": 1})])
    monkeypatch.setattr(svc, "get_parser", lambda type_: (lambda ref: parsed))
    monkeypatch.setattr(svc, "embed_texts", lambda texts: [[0.0] for _ in texts])
    monkeypatch.setattr(svc, "summarize_source", lambda text: "summary!")
    monkeypatch.setattr(svc, "insert_chunks", lambda rows: calls.setdefault("rows", rows))
    updates = []
    monkeypatch.setattr(svc, "update_source", lambda sid, **f: updates.append(f))

    svc.process_source("src1", "sess1", "pdf", "ref")

    assert calls["rows"][0]["session_id"] == "sess1"
    assert calls["rows"][0]["source_id"] == "src1"
    assert any(u.get("status") == "ready" for u in updates)
    assert any(u.get("summary") == "summary!" for u in updates)


def test_process_source_marks_error(monkeypatch):
    def boom(ref):
        raise ValueError("no transcript")
    monkeypatch.setattr(svc, "get_parser", lambda type_: boom)
    updates = []
    monkeypatch.setattr(svc, "update_source", lambda sid, **f: updates.append(f))
    svc.process_source("src1", "sess1", "youtube", "ref")
    assert any(u.get("status") == "error" for u in updates)
```

- [ ] **Step 2: Run to verify it fails** — `pytest tests/test_ingestion_service.py -v` — Expected: FAIL.

- [ ] **Step 3: Implement `service.py`**

```python
from app.ingestion.pdf import PdfParser
from app.ingestion.pptx import PptxParser
from app.ingestion.youtube import YoutubeParser
from app.ingestion.webpage import WebpageParser
from app.ingestion.chunker import chunk_segments
from app.rag.embeddings import embed_texts
from app.rag.summarizer import summarize_source
from app.repository import insert_chunks, update_source

_PARSERS = {
    "pdf": PdfParser, "pptx": PptxParser, "youtube": YoutubeParser, "webpage": WebpageParser,
}


def get_parser(type_: str):
    return _PARSERS[type_]().parse


def process_source(source_id: str, session_id: str, type_: str, ref: str) -> None:
    try:
        parsed = get_parser(type_)(ref)
        chunks = chunk_segments(parsed.segments)
        embeddings = embed_texts([c.content for c in chunks])
        rows = [
            {
                "session_id": session_id,
                "source_id": source_id,
                "content": c.content,
                "embedding": e,
                "metadata": c.metadata,
            }
            for c, e in zip(chunks, embeddings)
        ]
        insert_chunks(rows)
        full_text = "\n".join(c.content for c in chunks)
        summary = summarize_source(full_text)
        update_source(source_id, status="ready", title=parsed.title, summary=summary)
    except Exception as e:  # noqa: BLE001
        update_source(source_id, status="error", error=str(e))
```

- [ ] **Step 4: Run to verify pass** — `pytest tests/test_ingestion_service.py -v` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/ingestion/service.py backend/tests/test_ingestion_service.py
git commit -m "feat: ingestion service orchestrating parse->chunk->embed->store"
```

---

## Phase 4 — API layer

### Task 4.1: Schemas + app entrypoint

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/schemas.py`
- Create: `backend/app/main.py`

- [ ] **Step 1: Implement `schemas.py`**

```python
from pydantic import BaseModel


class CreateSessionResponse(BaseModel):
    session_id: str


class AddUrlSourceRequest(BaseModel):
    session_id: str
    type: str  # youtube | webpage
    url: str


class SourceOut(BaseModel):
    id: str
    type: str
    title: str | None = None
    summary: str | None = None
    status: str
    error: str | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str


class QuizRequest(BaseModel):
    session_id: str
    n: int = 5
```

- [ ] **Step 2: Implement `main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.routers import sources, chat, quiz

app = FastAPI(title="Samasocial Learning Assistant")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(sources.router)
app.include_router(chat.router)
app.include_router(quiz.router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/models backend/app/main.py
git commit -m "feat: API schemas + FastAPI app entrypoint"
```

### Task 4.2: Sources router (upload + URL + status + session)

**Files:**
- Create: `backend/app/routers/__init__.py`
- Create: `backend/app/routers/sources.py`

- [ ] **Step 1: Implement `sources.py`**

```python
import os
import tempfile
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException
from app.models.schemas import CreateSessionResponse, AddUrlSourceRequest, SourceOut
from app.ingestion.service import process_source
from app.repository import (
    create_session, ensure_session, create_source, list_sources, get_source,
)

router = APIRouter(prefix="/api", tags=["sources"])

_ALLOWED_EXT = {".pdf": "pdf", ".pptx": "pptx"}
_MAX_BYTES = 25 * 1024 * 1024


@router.post("/session", response_model=CreateSessionResponse)
def new_session():
    return CreateSessionResponse(session_id=create_session())


@router.get("/sources", response_model=list[SourceOut])
def get_sources(session_id: str):
    return list_sources(session_id)


@router.get("/sources/{source_id}", response_model=SourceOut)
def source_status(source_id: str):
    src = get_source(source_id)
    if not src:
        raise HTTPException(404, "source not found")
    return src


@router.post("/sources/url", response_model=SourceOut)
def add_url_source(req: AddUrlSourceRequest, bg: BackgroundTasks):
    if req.type not in ("youtube", "webpage"):
        raise HTTPException(400, "type must be youtube or webpage")
    ensure_session(req.session_id)
    title = req.url
    sid = create_source(req.session_id, req.type, title)
    bg.add_task(process_source, sid, req.session_id, req.type, req.url)
    return get_source(sid)


@router.post("/sources/file", response_model=SourceOut)
async def add_file_source(bg: BackgroundTasks, session_id: str = Form(...), file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(400, "only .pdf and .pptx supported")
    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(400, "file too large (max 25MB)")
    ensure_session(session_id)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp.write(data); tmp.close()
    type_ = _ALLOWED_EXT[ext]
    sid = create_source(session_id, type_, file.filename)
    bg.add_task(process_source, sid, session_id, type_, tmp.name)
    return get_source(sid)
```

- [ ] **Step 2: Manual smoke test** — Run server (Task 6.1) and `curl -X POST localhost:8000/api/session`. Expected: `{"session_id":"..."}`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/__init__.py backend/app/routers/sources.py
git commit -m "feat: sources router (url + file upload + status + session)"
```

### Task 4.3: Chat router (SSE streaming)

**Files:**
- Create: `backend/app/routers/chat.py`

- [ ] **Step 1: Implement `chat.py`**

```python
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest
from app.config import get_settings
from app.rag.retriever import retrieve, build_context
from app.rag.generator import stream_answer, NO_CONTEXT_REPLY
from app.rag.citations import chip_for
from app.repository import add_message, list_messages

router = APIRouter(prefix="/api", tags=["chat"])


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/chat")
def chat(req: ChatRequest):
    s = get_settings()
    add_message(req.session_id, "user", req.message)
    history = list_messages(req.session_id, limit=10)[:-1]  # exclude the just-added user msg
    hits = retrieve(req.message, req.session_id, s.retrieval_top_k, s.retrieval_min_score)

    def gen():
        # de-dup source chips
        seen, chips = set(), []
        for h in hits:
            chip = chip_for(h["metadata"])
            if chip["label"] not in seen:
                seen.add(chip["label"]); chips.append(chip)
        yield _sse("sources", {"chips": chips})

        if not hits:
            yield _sse("token", {"text": NO_CONTEXT_REPLY})
            add_message(req.session_id, "assistant", NO_CONTEXT_REPLY, [])
            yield _sse("done", {})
            return

        context = build_context(hits)
        collected = []
        for token in stream_answer(req.message, context, history):
            collected.append(token)
            yield _sse("token", {"text": token})
        add_message(req.session_id, "assistant", "".join(collected), chips)
        yield _sse("done", {})

    return StreamingResponse(gen(), media_type="text/event-stream")
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/routers/chat.py
git commit -m "feat: chat router with SSE streaming + source chips + memory"
```

### Task 4.4: Quiz router

**Files:**
- Create: `backend/app/routers/quiz.py`

- [ ] **Step 1: Implement `quiz.py`**

```python
from fastapi import APIRouter, HTTPException
from app.models.schemas import QuizRequest
from app.rag.quiz import generate_quiz
from app.rag.retriever import build_context
from app.repository import match_chunks
from app.rag.embeddings import embed_query

router = APIRouter(prefix="/api", tags=["quiz"])


@router.post("/quiz")
def quiz(req: QuizRequest):
    # pull a spread of chunks via a generic query embedding
    emb = embed_query("key concepts and main ideas")
    hits = match_chunks(emb, req.session_id, 12)
    if not hits:
        raise HTTPException(400, "No sources loaded for this session")
    questions = generate_quiz(build_context(hits), n=req.n)
    return {"questions": questions}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/routers/quiz.py
git commit -m "feat: quiz router"
```

### Task 4.5: Full backend test run

- [ ] **Step 1: Run all tests** — `cd backend && . .venv/bin/activate && pytest -v` — Expected: all PASS.
- [ ] **Step 2: Commit any fixes** — `git commit -am "test: green backend suite"` (if needed).

---

## Phase 5 — Frontend (Next.js)

### Task 5.1: Scaffold Next.js app

**Files:**
- Create: `frontend/` (via create-next-app)
- Create: `frontend/.env.local.example`

- [ ] **Step 1: Scaffold**

Run: `cd /Users/salescode/samasocial-learning-assistant && npx create-next-app@latest frontend --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*" --use-npm --yes`

- [ ] **Step 2: Create `.env.local.example`**

```
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

- [ ] **Step 3: Commit**

```bash
git add frontend && git commit -m "chore: scaffold Next.js frontend"
```

### Task 5.2: Types, session, API client (with SSE parsing)

**Files:**
- Create: `frontend/lib/types.ts`
- Create: `frontend/lib/session.ts`
- Create: `frontend/lib/api.ts`

- [ ] **Step 1: Implement `types.ts`**

```typescript
export type SourceStatus = "processing" | "ready" | "error";
export type SourceType = "pdf" | "pptx" | "youtube" | "webpage";

export interface Source {
  id: string;
  type: SourceType;
  title: string | null;
  summary: string | null;
  status: SourceStatus;
  error: string | null;
}

export interface Chip { label: string; icon: string; }

export interface Message {
  role: "user" | "assistant";
  content: string;
  chips?: Chip[];
}

export interface QuizQuestion { question: string; answer: string; }
```

- [ ] **Step 2: Implement `session.ts`**

```typescript
const KEY = "sama_session_id";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function getSessionId(): Promise<string> {
  let id = localStorage.getItem(KEY);
  if (id) return id;
  const res = await fetch(`${API}/api/session`, { method: "POST" });
  const data = await res.json();
  localStorage.setItem(KEY, data.session_id);
  return data.session_id;
}
```

- [ ] **Step 3: Implement `api.ts`**

```typescript
import { Source, Chip, QuizQuestion } from "./types";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function listSources(sessionId: string): Promise<Source[]> {
  const r = await fetch(`${API}/api/sources?session_id=${sessionId}`);
  return r.json();
}

export async function getSource(id: string): Promise<Source> {
  const r = await fetch(`${API}/api/sources/${id}`);
  return r.json();
}

export async function addUrlSource(sessionId: string, type: string, url: string): Promise<Source> {
  const r = await fetch(`${API}/api/sources/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, type, url }),
  });
  if (!r.ok) throw new Error((await r.json()).detail || "Failed to add source");
  return r.json();
}

export async function addFileSource(sessionId: string, file: File): Promise<Source> {
  const fd = new FormData();
  fd.append("session_id", sessionId);
  fd.append("file", file);
  const r = await fetch(`${API}/api/sources/file`, { method: "POST", body: fd });
  if (!r.ok) throw new Error((await r.json()).detail || "Upload failed");
  return r.json();
}

export async function generateQuiz(sessionId: string, n = 5): Promise<QuizQuestion[]> {
  const r = await fetch(`${API}/api/quiz`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, n }),
  });
  if (!r.ok) throw new Error((await r.json()).detail || "Quiz failed");
  return (await r.json()).questions;
}

// Streams chat: calls onChips once, onToken per token, resolves on done.
export async function streamChat(
  sessionId: string,
  message: string,
  onChips: (chips: Chip[]) => void,
  onToken: (text: string) => void,
): Promise<void> {
  const res = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  if (!res.body) throw new Error("No stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() || "";
    for (const ev of events) {
      const lines = ev.split("\n");
      const evType = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
      const dataLine = lines.find((l) => l.startsWith("data:"))?.slice(5).trim();
      if (!dataLine) continue;
      const data = JSON.parse(dataLine);
      if (evType === "sources") onChips(data.chips);
      else if (evType === "token") onToken(data.text);
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib && git commit -m "feat: frontend types, session, API client with SSE parsing"
```

### Task 5.3: Source panel components

**Files:**
- Create: `frontend/components/SourcePanel.tsx`
- Create: `frontend/components/AddSourceForm.tsx`
- Create: `frontend/components/SourceCard.tsx`

- [ ] **Step 1: Implement `SourceCard.tsx`**

```tsx
import { Source } from "@/lib/types";

const ICON: Record<string, string> = { pdf: "📄", pptx: "▭", youtube: "▶", webpage: "🌐" };

export function SourceCard({ source }: { source: Source }) {
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <span>{ICON[source.type]}</span>
        <span className="truncate">{source.title || source.type}</span>
        {source.status === "processing" && <span className="ml-auto animate-pulse text-amber-500">processing…</span>}
        {source.status === "ready" && <span className="ml-auto text-green-600">ready</span>}
        {source.status === "error" && <span className="ml-auto text-red-600">error</span>}
      </div>
      {source.summary && <p className="mt-2 text-gray-600">{source.summary}</p>}
      {source.error && <p className="mt-2 text-red-600">{source.error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Implement `AddSourceForm.tsx`**

```tsx
"use client";
import { useState } from "react";
import { addUrlSource, addFileSource } from "@/lib/api";
import { Source } from "@/lib/types";

export function AddSourceForm({ sessionId, onAdded }: { sessionId: string; onAdded: (s: Source) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isYoutube = (u: string) => /youtube\.com|youtu\.be/.test(u);

  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true); setError("");
    try {
      const s = await addUrlSource(sessionId, isYoutube(url) ? "youtube" : "webpage", url.trim());
      onAdded(s); setUrl("");
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError("");
    try { onAdded(await addFileSource(sessionId, file)); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); e.target.value = ""; }
  }

  return (
    <div className="space-y-2">
      <form onSubmit={submitUrl} className="flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="YouTube or webpage URL"
          className="flex-1 rounded border px-2 py-1 text-sm" />
        <button disabled={busy} className="rounded bg-indigo-600 px-3 py-1 text-sm text-white disabled:opacity-50">Add</button>
      </form>
      <label className="block cursor-pointer rounded border border-dashed p-3 text-center text-sm text-gray-500">
        {busy ? "Uploading…" : "Upload PDF or PPTX"}
        <input type="file" accept=".pdf,.pptx" hidden onChange={onFile} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Implement `SourcePanel.tsx` (with status polling)**

```tsx
"use client";
import { useEffect } from "react";
import { Source } from "@/lib/types";
import { getSource } from "@/lib/api";
import { SourceCard } from "./SourceCard";
import { AddSourceForm } from "./AddSourceForm";

export function SourcePanel({
  sessionId, sources, setSources,
}: { sessionId: string; sources: Source[]; setSources: React.Dispatch<React.SetStateAction<Source[]>> }) {
  // poll any processing sources
  useEffect(() => {
    const processing = sources.filter((s) => s.status === "processing");
    if (processing.length === 0) return;
    const t = setInterval(async () => {
      const updated = await Promise.all(processing.map((s) => getSource(s.id)));
      setSources((prev) => prev.map((s) => updated.find((u) => u.id === s.id) || s));
    }, 2500);
    return () => clearInterval(t);
  }, [sources, setSources]);

  return (
    <div className="flex h-full flex-col gap-3 border-r p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Sources</h2>
      <AddSourceForm sessionId={sessionId} onAdded={(s) => setSources((p) => [...p, s])} />
      <div className="flex-1 space-y-2 overflow-y-auto">
        {sources.length === 0 && <p className="text-sm text-gray-400">No sources yet. Add one to begin.</p>}
        {sources.map((s) => <SourceCard key={s.id} source={s} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/SourcePanel.tsx frontend/components/AddSourceForm.tsx frontend/components/SourceCard.tsx
git commit -m "feat: source panel with add form, cards, status polling"
```

### Task 5.4: Chat components

**Files:**
- Create: `frontend/components/ChatWindow.tsx`
- Create: `frontend/components/MessageBubble.tsx`

- [ ] **Step 1: Implement `MessageBubble.tsx`**

```tsx
import { Message } from "@/lib/types";

export function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${isUser ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-900"}`}>
        <p className="whitespace-pre-wrap">{msg.content || "…"}</p>
        {msg.chips && msg.chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {msg.chips.map((c, i) => (
              <span key={i} className="rounded-full bg-white/70 px-2 py-0.5 text-xs text-gray-700 ring-1 ring-gray-300">{c.label}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `ChatWindow.tsx`**

```tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { Message } from "@/lib/types";
import { streamChat } from "@/lib/api";
import { MessageBubble } from "./MessageBubble";

export function ChatWindow({ sessionId, hasSources }: { sessionId: string; hasSources: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput(""); setBusy(true);
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "", chips: [] }]);
    try {
      await streamChat(
        sessionId, text,
        (chips) => setMessages((m) => { const c = [...m]; c[c.length - 1].chips = chips; return c; }),
        (tok) => setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + tok }; return c; }),
      );
    } catch {
      setMessages((m) => { const c = [...m]; c[c.length - 1].content = "Something went wrong. Please try again."; return c; });
    } finally { setBusy(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="mt-10 text-center text-sm text-gray-400">
            {hasSources ? "Ask anything about your sources." : "Add a source on the left, then ask a question."}
          </p>
        )}
        {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
          placeholder="Ask a question…" className="flex-1 rounded-full border px-4 py-2 text-sm" />
        <button disabled={busy || !input.trim()} className="rounded-full bg-indigo-600 px-5 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ChatWindow.tsx frontend/components/MessageBubble.tsx
git commit -m "feat: streaming chat window + message bubbles with source chips"
```

### Task 5.5: Quiz mode + main page assembly

**Files:**
- Create: `frontend/components/QuizMode.tsx`
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Implement `QuizMode.tsx`**

```tsx
"use client";
import { useState } from "react";
import { generateQuiz } from "@/lib/api";
import { QuizQuestion } from "@/lib/types";

export function QuizMode({ sessionId }: { sessionId: string }) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true); setError(""); setRevealed({});
    try { setQuestions(await generateQuiz(sessionId, 5)); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="flex h-full flex-col p-4">
      <button onClick={run} disabled={busy} className="mb-4 self-start rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">
        {busy ? "Generating…" : "Quiz me"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="space-y-3 overflow-y-auto">
        {questions.map((q, i) => (
          <div key={i} className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{i + 1}. {q.question}</p>
            {revealed[i]
              ? <p className="mt-2 text-green-700">{q.answer}</p>
              : <button onClick={() => setRevealed((r) => ({ ...r, [i]: true }))} className="mt-2 text-indigo-600 underline">Show answer</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `app/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { getSessionId } from "@/lib/session";
import { listSources } from "@/lib/api";
import { Source } from "@/lib/types";
import { SourcePanel } from "@/components/SourcePanel";
import { ChatWindow } from "@/components/ChatWindow";
import { QuizMode } from "@/components/QuizMode";

export default function Home() {
  const [sessionId, setSessionId] = useState<string>("");
  const [sources, setSources] = useState<Source[]>([]);
  const [tab, setTab] = useState<"chat" | "quiz">("chat");

  useEffect(() => {
    getSessionId().then(async (id) => {
      setSessionId(id);
      setSources(await listSources(id));
    });
  }, []);

  if (!sessionId) return <div className="grid h-screen place-items-center text-gray-400">Loading…</div>;

  return (
    <main className="grid h-screen grid-cols-[320px_1fr]">
      <SourcePanel sessionId={sessionId} sources={sources} setSources={setSources} />
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <h1 className="mr-auto font-semibold">Learning Assistant</h1>
          <button onClick={() => setTab("chat")} className={`rounded px-3 py-1 text-sm ${tab === "chat" ? "bg-indigo-600 text-white" : "text-gray-600"}`}>Chat</button>
          <button onClick={() => setTab("quiz")} className={`rounded px-3 py-1 text-sm ${tab === "quiz" ? "bg-indigo-600 text-white" : "text-gray-600"}`}>Quiz</button>
        </div>
        {tab === "chat"
          ? <ChatWindow sessionId={sessionId} hasSources={sources.some((s) => s.status === "ready")} />
          : <QuizMode sessionId={sessionId} />}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/QuizMode.tsx frontend/app/page.tsx
git commit -m "feat: quiz mode + split-panel main page assembly"
```

---

## Phase 6 — Integration, docs, manual verification

### Task 6.1: Run both services together

- [ ] **Step 1: Start backend** — `cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000`
- [ ] **Step 2: Start frontend** — `cd frontend && cp .env.local.example .env.local && npm run dev`
- [ ] **Step 3: Open** http://localhost:3000 — verify session is created (check localStorage), source panel renders.

### Task 6.2: End-to-end manual test (the planned answer-quality pass)

- [ ] Add a YouTube URL → wait for `ready` → confirm summary appears.
- [ ] Add a PDF → ask a question answerable only from the PDF → confirm grounded answer + "PDF p.X" chip.
- [ ] Add a webpage + the PDF together → ask a cross-source question → confirm chips from both.
- [ ] Ask an out-of-scope question → confirm graceful decline.
- [ ] Ask "explain that in simple terms" follow-up → confirm session memory works.
- [ ] Switch to Quiz tab → "Quiz me" → confirm grounded questions.
- [ ] Trigger an error case (YouTube with no transcript) → confirm error state on the card.

### Task 6.3: README + run scripts

**Files:**
- Create: `README.md`
- Create: `backend/run.sh`

- [ ] **Step 1: Write `README.md`** — include: overview, architecture diagram, stack, env vars (backend `.env`, frontend `.env.local`), Supabase schema setup steps, how to run backend + frontend, design decisions (metadata-tagged RAG, async ingestion, out-of-scope guard), documented limitations (OCR, Whisper fallback, deployment), and bonus features implemented.

- [ ] **Step 2: Commit**

```bash
git add README.md backend/run.sh && git commit -m "docs: README with setup, architecture, and decisions"
```

### Task 6.4: Final verification

- [ ] **Step 1:** `cd backend && . .venv/bin/activate && pytest -v` — all green.
- [ ] **Step 2:** `cd frontend && npm run build` — builds clean.
- [ ] **Step 3:** Record the 3–5 min demo video walking through Task 6.2 scenarios.

---

## Self-Review Notes

- **Spec coverage:** every spec section maps to a task — ingestion (1.1–1.5), retrieval+citations (1.6, 3.2), streaming (3.3, 4.3, 5.2/5.4), session memory (2.2, 4.3), UI (5.x), bonuses (multi-source chips 4.3/5.4, quiz 3.4/4.4/5.5, summaries 3.4/3.5/5.3), error states (parsers raise → service marks error → SourceCard renders), config (0.1).
- **Type consistency:** `Chunk{content, metadata}`, `ParsedSource{title, segments}`, chip `{label, icon}`, source fields (`status`, `summary`, `error`) are consistent across backend and frontend types.
- **No placeholders:** all code steps contain runnable code; README is the only descriptive task (acceptable — it's prose).
