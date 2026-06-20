# Challenge 1 RAG Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the `samasocial-learning-assistant` app into the AI/ML Challenge 1 RAG chatbot — a fully open-source retrieval stack (local BGE embeddings + local pgvector) answering questions over a ≥10-PDF CS/ML corpus with OCR support, cross-encoder reranking, page-level citations, an eval harness, and a retrieval-visualization panel, all within 2–5s latency.

**Architecture:** Keep the FastAPI backend + Next.js frontend. Replace the two rule-violating pieces — OpenAI embeddings → local `sentence-transformers` BGE, and hosted Supabase → local Postgres+pgvector (via Docker) accessed with `psycopg`. Add a Tesseract OCR fallback to PDF ingestion, a `bge-reranker-base` cross-encoder, a scripted CS/ML corpus loaded into a fixed corpus session, an evaluation harness, and a Retrieval Inspector UI. Generation stays on hosted `gpt-4o-mini` (the brief allows a hosted LLM).

**Tech Stack:** Python 3.13, FastAPI, `psycopg[binary]` + `psycopg-pool` + `pgvector`, Postgres 16 + pgvector (Docker), `sentence-transformers` (BGE embed + rerank), PyMuPDF + Tesseract (`pytesseract`/`Pillow`) + `langdetect`, OpenAI `gpt-4o-mini`, Next.js/TypeScript, pytest.

## Global Constraints

- **Embedding model MUST be free/open-source** — `BAAI/bge-base-en-v1.5` (768-d), run locally. No OpenAI embeddings anywhere on the ingest or query path.
- **Vector DB MUST be free/open-source** — Postgres + pgvector, run locally via Docker.
- **ANN index MUST be HNSW or IVF+PQ** — use HNSW (`vector_cosine_ops`).
- **Chunking:** 500–1000 tokens, 10–30% overlap → use **600 tokens / 90 overlap (15%)**.
- **Every answer cites PDF filename + page number.**
- **End-to-end query→answer latency target: 2–5s** (local M1, 8 GB RAM).
- **Reproducible:** corpus fetched by script; embeddings precomputed & persisted; deterministic chunking.
- **Embedding dimension is 768 everywhere** (schema, RPC, code).
- Existing features (YouTube/PPTX/webpage/quiz/voice) must keep working; do not delete them.
- Follow existing patterns: pytest with function-level monkeypatch mocks; `with_retry()` on data-access functions; per-thread/pooled DB access.

---

### Task 1: Local Postgres + pgvector (Docker) and updated schema

**Files:**
- Create: `docker-compose.yml`
- Modify: `backend/sql/schema.sql` (dimension 1536→768, ivfflat→HNSW, `match_chunks` signature)
- Create: `backend/sql/verify.sql` (verification query)

**Interfaces:**
- Produces: a running Postgres at `postgresql://rag:rag@localhost:5432/rag` with the `vector` extension, all tables, an **HNSW** index on `chunks.embedding vector(768)`, and a `match_chunks(query_embedding vector(768), p_session_id uuid, match_count int)` SQL function returning `(id, source_id, content, metadata, similarity)`.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: rag
      POSTGRES_PASSWORD: rag
      POSTGRES_DB: rag
    ports:
      - "5432:5432"
    volumes:
      - ragdata:/var/lib/postgresql/data
      - ./backend/sql/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
volumes:
  ragdata:
```

- [ ] **Step 2: Update `backend/sql/schema.sql`**

Change the `chunks.embedding` dimension, the index, and the `match_chunks` function. Replace the embedding column line, the embedding index line, and the whole `match_chunks` function with:

```sql
-- chunks table: embedding is now 768-d (BAAI/bge-base-en-v1.5)
create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  source_id uuid references sources(id) on delete cascade,
  content text not null,
  embedding vector(768),
  metadata jsonb default '{}'::jsonb
);
create index if not exists chunks_session_idx on chunks(session_id);
create index if not exists chunks_embedding_idx
  on chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create or replace function match_chunks(
  query_embedding vector(768),
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

(Leave `sessions`, `sources`, `messages`, `quizzes` tables and the `create extension` line unchanged.)

- [ ] **Step 3: Write `backend/sql/verify.sql`**

```sql
select extname from pg_extension where extname = 'vector';
select indexdef from pg_indexes where indexname = 'chunks_embedding_idx';
select proname from pg_proc where proname = 'match_chunks';
```

- [ ] **Step 4: Bring up the DB and verify schema applied**

Run:
```bash
cd /Users/salescode/development/samasocial-learning-assistant
docker compose up -d db
sleep 5
docker compose exec -T db psql -U rag -d rag -f /docker-entrypoint-initdb.d/01-schema.sql 2>/dev/null || true
docker compose exec -T db psql -U rag -d rag < backend/sql/verify.sql
```
Expected output contains: `vector`, an index def containing `hnsw`, and `match_chunks`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml backend/sql/schema.sql backend/sql/verify.sql
git commit -m "feat(db): local pgvector via Docker, 768-d HNSW schema"
```

---

### Task 2: Configuration & environment for the local OSS stack

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/.env.example`
- Test: `backend/tests/test_config.py` (create)

**Interfaces:**
- Produces: `Settings` gains `database_url: str`, `embed_model: str = "BAAI/bge-base-en-v1.5"`, `reranker_model: str = "BAAI/bge-reranker-base"`, `rerank_enabled: bool = True`, `retrieve_candidates: int = 20`, `corpus_session_id: str`. Existing fields stay. `retrieval_top_k` (=6) and `retrieval_min_score` stay; set `retrieval_min_score` default to `0.30` (BGE cosine scale).

- [ ] **Step 1: Write the failing test** — `backend/tests/test_config.py`

```python
from app.config import Settings


def test_new_settings_defaults(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    monkeypatch.setenv("DATABASE_URL", "postgresql://rag:rag@localhost:5432/rag")
    monkeypatch.setenv("CORPUS_SESSION_ID", "00000000-0000-0000-0000-000000000001")
    s = Settings()
    assert s.embed_model == "BAAI/bge-base-en-v1.5"
    assert s.reranker_model == "BAAI/bge-reranker-base"
    assert s.rerank_enabled is True
    assert s.retrieve_candidates == 20
    assert s.retrieval_top_k == 6
    assert s.database_url.startswith("postgresql://")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_config.py -v`
Expected: FAIL (`AttributeError`/`ValidationError` — fields not defined).

- [ ] **Step 3: Update `backend/app/config.py`**

Replace the `Settings` class body fields with (keep `model_config`, `cors_origin_list`, `get_settings`):

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: str
    openai_chat_model: str = "gpt-4o-mini"
    openai_transcribe_model: str = "whisper-1"

    # Local open-source stack (Challenge 1)
    database_url: str = "postgresql://rag:rag@localhost:5432/rag"
    embed_model: str = "BAAI/bge-base-en-v1.5"
    reranker_model: str = "BAAI/bge-reranker-base"
    rerank_enabled: bool = True
    retrieve_candidates: int = 20
    corpus_session_id: str = "00000000-0000-0000-0000-000000000001"

    retrieval_top_k: int = 6
    retrieval_min_score: float = 0.30
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]
```

(Note: `openai_embed_model` is removed — embeddings are now local.)

- [ ] **Step 4: Update `backend/.env.example`**

```
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_TRANSCRIBE_MODEL=whisper-1
DATABASE_URL=postgresql://rag:rag@localhost:5432/rag
EMBED_MODEL=BAAI/bge-base-en-v1.5
RERANKER_MODEL=BAAI/bge-reranker-base
RERANK_ENABLED=true
RETRIEVE_CANDIDATES=20
RETRIEVAL_TOP_K=6
RETRIEVAL_MIN_SCORE=0.30
CORPUS_SESSION_ID=00000000-0000-0000-0000-000000000001
CORS_ORIGINS=http://localhost:3000
```

- [ ] **Step 5: Update `backend/tests/conftest.py`** so settings instantiate without Supabase env:

```python
import os

os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("DATABASE_URL", "postgresql://rag:rag@localhost:5432/rag")
os.environ.setdefault("CORPUS_SESSION_ID", "00000000-0000-0000-0000-000000000001")
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_config.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/config.py backend/.env.example backend/tests/test_config.py backend/tests/conftest.py
git commit -m "feat(config): settings for local pgvector + BGE stack"
```

---

### Task 3: Data layer → psycopg + pgvector

**Files:**
- Modify: `backend/app/db.py` (replace supabase client with a psycopg pool)
- Modify: `backend/app/repository.py` (rewrite all functions as SQL)
- Modify: `backend/requirements.txt` (add psycopg/pgvector/numpy; remove supabase)
- Test: `backend/tests/test_repository.py` (rewrite the two batching tests)

**Interfaces:**
- Consumes: `get_settings().database_url` (Task 2); the `match_chunks` SQL function and schema (Task 1).
- Produces (unchanged public signatures so routers/quiz keep working):
  `create_session() -> str`, `ensure_session(session_id) -> str`, `create_source(session_id, type_, title) -> str`, `update_source(source_id, **fields)`, `delete_session(session_id)`, `delete_source(source_id)`, `list_sources(session_id) -> list[dict]`, `get_source(source_id) -> dict|None`, `insert_chunks(rows, batch_size=100)`, `get_source_chunks(source_id, limit=300) -> list[dict]`, `match_chunks(query_embedding: list[float], session_id, k) -> list[dict]`, `quiz_insert(...)`, `quiz_get(...)`, `quiz_update_hints(...)`, `add_message(...)`, `list_messages(...)`. Each `rows` item for `insert_chunks` is `{"session_id","source_id","content","embedding": list[float],"metadata": dict}`.

- [ ] **Step 1: Update `backend/requirements.txt`**

Remove the `supabase==2.*` line; add:

```
psycopg[binary]==3.2.*
psycopg-pool==3.2.*
pgvector==0.3.*
numpy==2.*
```

Install: `cd backend && pip install -r requirements.txt`

- [ ] **Step 2: Rewrite `backend/app/db.py`**

```python
from functools import lru_cache

from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import get_settings


def _configure(conn):
    register_vector(conn)


@lru_cache
def get_pool() -> ConnectionPool:
    s = get_settings()
    return ConnectionPool(
        conninfo=s.database_url,
        min_size=1,
        max_size=10,
        kwargs={"row_factory": dict_row},
        configure=_configure,
        open=True,
    )
```

- [ ] **Step 3: Rewrite `backend/app/repository.py`** to use the pool with raw SQL:

```python
import json

import numpy as np

from app.db import get_pool
from app.retry import with_retry


@with_retry()
def create_session() -> str:
    with get_pool().connection() as c:
        row = c.execute("insert into sessions default values returning id").fetchone()
    return str(row["id"])


@with_retry()
def ensure_session(session_id: str) -> str:
    with get_pool().connection() as c:
        c.execute(
            "insert into sessions (id) values (%s) on conflict (id) do nothing",
            (session_id,),
        )
    return session_id


@with_retry()
def create_source(session_id: str, type_: str, title: str) -> str:
    with get_pool().connection() as c:
        row = c.execute(
            "insert into sources (session_id, type, title, status) "
            "values (%s, %s, %s, 'processing') returning id",
            (session_id, type_, title),
        ).fetchone()
    return str(row["id"])


@with_retry()
def update_source(source_id: str, **fields) -> None:
    if not fields:
        return
    cols = ", ".join(f"{k} = %s" for k in fields)
    with get_pool().connection() as c:
        c.execute(
            f"update sources set {cols} where id = %s",
            (*fields.values(), source_id),
        )


@with_retry()
def delete_session(session_id: str) -> None:
    with get_pool().connection() as c:
        c.execute("delete from sessions where id = %s", (session_id,))


@with_retry()
def delete_source(source_id: str) -> None:
    with get_pool().connection() as c:
        c.execute("delete from sources where id = %s", (source_id,))


@with_retry()
def list_sources(session_id: str) -> list[dict]:
    with get_pool().connection() as c:
        return c.execute(
            "select * from sources where session_id = %s order by created_at",
            (session_id,),
        ).fetchall()


@with_retry()
def get_source(source_id: str) -> dict | None:
    with get_pool().connection() as c:
        return c.execute(
            "select * from sources where id = %s", (source_id,)
        ).fetchone()


def insert_chunks(rows: list[dict], batch_size: int = 100) -> None:
    for i in range(0, len(rows), batch_size):
        _insert_chunk_batch(rows[i : i + batch_size])


@with_retry()
def _insert_chunk_batch(batch: list[dict]) -> None:
    if not batch:
        return
    with get_pool().connection() as c, c.cursor() as cur:
        cur.executemany(
            "insert into chunks (session_id, source_id, content, embedding, metadata) "
            "values (%s, %s, %s, %s, %s)",
            [
                (
                    r["session_id"],
                    r["source_id"],
                    r["content"],
                    np.asarray(r["embedding"], dtype=np.float32),
                    json.dumps(r.get("metadata", {})),
                )
                for r in batch
            ],
        )


@with_retry()
def get_source_chunks(source_id: str, limit: int = 300) -> list[dict]:
    with get_pool().connection() as c:
        return c.execute(
            "select content, metadata from chunks where source_id = %s limit %s",
            (source_id, limit),
        ).fetchall()


@with_retry()
def match_chunks(query_embedding: list[float], session_id: str, k: int) -> list[dict]:
    vec = np.asarray(query_embedding, dtype=np.float32)
    with get_pool().connection() as c:
        return c.execute(
            "select * from match_chunks(%s, %s, %s)",
            (vec, session_id, k),
        ).fetchall()


@with_retry()
def quiz_insert(session_id: str, payload: dict, hints_used: int = 0) -> str:
    with get_pool().connection() as c:
        row = c.execute(
            "insert into quizzes (session_id, payload, hints_used) "
            "values (%s, %s, %s) returning id",
            (session_id, json.dumps(payload), hints_used),
        ).fetchone()
    return str(row["id"])


@with_retry()
def quiz_get(quiz_id: str) -> dict | None:
    with get_pool().connection() as c:
        return c.execute("select * from quizzes where id = %s", (quiz_id,)).fetchone()


@with_retry()
def quiz_update_hints(quiz_id: str, hints_used: int) -> None:
    with get_pool().connection() as c:
        c.execute(
            "update quizzes set hints_used = %s where id = %s", (hints_used, quiz_id)
        )


@with_retry()
def add_message(session_id: str, role: str, content: str, citations: list | None = None) -> None:
    with get_pool().connection() as c:
        c.execute(
            "insert into messages (session_id, role, content, citations) "
            "values (%s, %s, %s, %s)",
            (session_id, role, content, json.dumps(citations or [])),
        )


@with_retry()
def list_messages(session_id: str, limit: int = 20) -> list[dict]:
    with get_pool().connection() as c:
        rows = c.execute(
            "select * from messages where session_id = %s "
            "order by created_at desc limit %s",
            (session_id, limit),
        ).fetchall()
    return rows[::-1]
```

- [ ] **Step 4: Rewrite the two tests in `backend/tests/test_repository.py`**

```python
from app import repository as repo


class _FakeCursor:
    def __init__(self, sink):
        self._sink = sink

    def executemany(self, sql, params):
        self._sink.append(len(params))

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _FakeConn:
    def __init__(self, sink):
        self._sink = sink

    def cursor(self):
        return _FakeCursor(self._sink)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _FakePool:
    def __init__(self, sink):
        self._sink = sink

    def connection(self):
        return _FakeConn(self._sink)


def test_insert_chunks_batches_large_inserts(monkeypatch):
    sink: list[int] = []
    monkeypatch.setattr(repo, "get_pool", lambda: _FakePool(sink))
    rows = [
        {"session_id": "s", "source_id": "x", "content": str(i),
         "embedding": [0.0], "metadata": {}}
        for i in range(250)
    ]
    repo.insert_chunks(rows, batch_size=100)
    assert sink == [100, 100, 50]


def test_insert_chunks_empty_noop(monkeypatch):
    sink: list[int] = []
    monkeypatch.setattr(repo, "get_pool", lambda: _FakePool(sink))
    repo.insert_chunks([])
    assert sink == []
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_repository.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Integration smoke against the live DB** (requires Task 1 DB running)

Run:
```bash
cd backend && python -c "
from app import repository as repo
sid = repo.ensure_session('00000000-0000-0000-0000-000000000009')
src = repo.create_source(sid, 'pdf', 'smoke.pdf')
repo.insert_chunks([{'session_id': sid,'source_id': src,'content':'hello world','embedding':[0.01]*768,'metadata':{'type':'pdf','page':1,'filename':'smoke.pdf'}}])
hits = repo.match_chunks([0.01]*768, sid, 3)
print('HITS', len(hits), hits[0]['similarity'] if hits else None)
repo.delete_session(sid)
print('OK')
"
```
Expected: prints `HITS 1 ...` then `OK`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/db.py backend/app/repository.py backend/requirements.txt backend/tests/test_repository.py
git commit -m "feat(db): replace supabase client with psycopg + pgvector"
```

---

### Task 4: Embeddings → local BGE (`sentence-transformers`)

**Files:**
- Modify: `backend/app/rag/embeddings.py`
- Modify: `backend/requirements.txt` (add sentence-transformers/torch)
- Test: `backend/tests/test_embeddings.py` (rewrite to mock the local model)

**Interfaces:**
- Consumes: `get_settings().embed_model` (Task 2).
- Produces (unchanged signatures): `embed_texts(texts: list[str]) -> list[list[float]]` (768-d each, passages embedded plain), `embed_query(text: str) -> list[float]` (BGE retrieval instruction prefixed). Internal `_get_model()` lazy-loads a cached `SentenceTransformer`.

- [ ] **Step 1: Update `backend/requirements.txt`** — add:

```
sentence-transformers==3.*
torch==2.*
```

Install: `cd backend && pip install -r requirements.txt`

- [ ] **Step 2: Write the failing test** — replace `backend/tests/test_embeddings.py`:

```python
from app.rag import embeddings as emb


class _FakeModel:
    def encode(self, texts, **kw):
        # return a deterministic 768-d-ish vector per input (length 2 is fine for the test)
        return [[float(len(t)), 0.5] for t in texts]


def test_embed_texts_returns_vectors(monkeypatch):
    monkeypatch.setattr(emb, "_get_model", lambda: _FakeModel())
    out = emb.embed_texts(["ab", "cde"])
    assert out == [[2.0, 0.5], [3.0, 0.5]]


def test_embed_texts_empty():
    assert emb.embed_texts([]) == []


def test_embed_query_prefixes_instruction(monkeypatch):
    seen = {}

    class _M:
        def encode(self, texts, **kw):
            seen["texts"] = texts
            return [[0.1, 0.2]]

    monkeypatch.setattr(emb, "_get_model", lambda: _M())
    emb.embed_query("what is a transformer")
    assert seen["texts"][0].startswith("Represent this sentence")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_embeddings.py -v`
Expected: FAIL (`_get_model` not defined / old OpenAI code).

- [ ] **Step 4: Rewrite `backend/app/rag/embeddings.py`**

```python
from functools import lru_cache

from app.config import get_settings

# BGE-v1.5 recommends a retrieval instruction on the QUERY only; passages plain.
_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "
_BATCH = 64


@lru_cache
def _get_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(get_settings().embed_model)


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = _get_model()
    vecs = model.encode(
        texts, batch_size=_BATCH, normalize_embeddings=True, show_progress_bar=False
    )
    return [list(map(float, v)) for v in vecs]


def embed_query(text: str) -> list[float]:
    model = _get_model()
    vec = model.encode(
        [_QUERY_INSTRUCTION + text],
        normalize_embeddings=True,
        show_progress_bar=False,
    )[0]
    return list(map(float, vec))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_embeddings.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Real model smoke (downloads model once)**

Run: `cd backend && python -c "from app.rag.embeddings import embed_query; v=embed_query('test'); print(len(v))"`
Expected: prints `768`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/rag/embeddings.py backend/requirements.txt backend/tests/test_embeddings.py
git commit -m "feat(embed): local BGE embeddings via sentence-transformers"
```

---

### Task 5: PDF ingestion with OCR + rich metadata

**Files:**
- Modify: `backend/app/ingestion/pdf.py`
- Modify: `backend/requirements.txt` (add pytesseract/Pillow/langdetect)
- Test: `backend/tests/test_pdf.py`

**Interfaces:**
- Produces: `PdfParser.parse(ref: str) -> ParsedSource` where each segment metadata is
  `{"type":"pdf","page":int,"filename":str,"pdf_id":str,"extraction":"native"|"ocr","lang":str}`.
  Helper `_ocr_page(page) -> str` and `_strip_headers_footers(segments)`.
- Requires system Tesseract: `brew install tesseract`.

- [ ] **Step 1: Update `backend/requirements.txt`** — add:

```
pytesseract==0.3.*
Pillow==11.*
langdetect==1.0.*
```

Install: `cd backend && pip install -r requirements.txt` and `brew install tesseract`.

- [ ] **Step 2: Write the failing test** — replace `backend/tests/test_pdf.py`:

```python
import fitz
import pytest

from app.ingestion.pdf import PdfParser


def _make_pdf(tmp_path, text):
    doc = fitz.open()
    page = doc.new_page()
    if text:
        page.insert_text((72, 72), text)
    p = tmp_path / "doc.pdf"
    doc.save(str(p))
    return str(p)


def test_native_text_extraction_sets_metadata(tmp_path):
    ref = _make_pdf(tmp_path, "Gradient descent optimizes the loss function.")
    parsed = PdfParser().parse(ref)
    assert parsed.title == "doc.pdf"
    text, meta = parsed.segments[0]
    assert "Gradient descent" in text
    assert meta["type"] == "pdf"
    assert meta["page"] == 1
    assert meta["filename"] == "doc.pdf"
    assert meta["pdf_id"] == "doc.pdf"
    assert meta["extraction"] == "native"
    assert "lang" in meta


def test_scanned_page_falls_back_to_ocr(tmp_path, monkeypatch):
    ref = _make_pdf(tmp_path, "")  # no extractable text -> OCR path
    monkeypatch.setattr(
        "app.ingestion.pdf._ocr_page", lambda page: "Recovered via OCR neural network"
    )
    parsed = PdfParser().parse(ref)
    text, meta = parsed.segments[0]
    assert "Recovered via OCR" in text
    assert meta["extraction"] == "ocr"


def test_completely_empty_pdf_raises(tmp_path, monkeypatch):
    ref = _make_pdf(tmp_path, "")
    monkeypatch.setattr("app.ingestion.pdf._ocr_page", lambda page: "")
    with pytest.raises(ValueError):
        PdfParser().parse(ref)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_pdf.py -v`
Expected: FAIL (new metadata keys / OCR path not present).

- [ ] **Step 4: Rewrite `backend/app/ingestion/pdf.py`**

```python
import io
import os
from collections import Counter

import fitz

from app.ingestion.base import ParsedSource

_MIN_NATIVE_CHARS = 20  # below this, treat the page as scanned and OCR it


def _ocr_page(page) -> str:
    import pytesseract
    from PIL import Image

    pix = page.get_pixmap(dpi=200)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    return pytesseract.image_to_string(img).strip()


def _detect_lang(text: str) -> str:
    try:
        from langdetect import detect

        return detect(text)
    except Exception:
        return "unknown"


def _strip_headers_footers(pages: list[str]) -> list[str]:
    """Drop first/last lines that repeat across many pages (running headers/footers)."""
    firsts = Counter()
    lasts = Counter()
    split = [p.splitlines() for p in pages]
    for lines in split:
        if lines:
            firsts[lines[0].strip()] += 1
            lasts[lines[-1].strip()] += 1
    n = len(pages)
    threshold = max(3, n // 2)
    drop_first = {k for k, v in firsts.items() if k and v >= threshold}
    drop_last = {k for k, v in lasts.items() if k and v >= threshold}
    out = []
    for lines in split:
        if lines and lines[0].strip() in drop_first:
            lines = lines[1:]
        if lines and lines[-1].strip() in drop_last:
            lines = lines[:-1]
        out.append("\n".join(lines).strip())
    return out


class PdfParser:
    def parse(self, ref: str) -> ParsedSource:
        doc = fitz.open(ref)
        filename = os.path.basename(ref)
        raw: list[tuple[str, str]] = []  # (text, extraction)
        for page in doc:
            text = page.get_text().strip()
            extraction = "native"
            if len(text) < _MIN_NATIVE_CHARS:
                ocr = _ocr_page(page)
                if ocr:
                    text, extraction = ocr, "ocr"
            raw.append((text, extraction))

        cleaned = _strip_headers_footers([t for t, _ in raw])
        segments: list[tuple[str, dict]] = []
        for i, (text, (_, extraction)) in enumerate(zip(cleaned, raw), start=1):
            if not text:
                continue
            segments.append(
                (
                    text,
                    {
                        "type": "pdf",
                        "page": i,
                        "filename": filename,
                        "pdf_id": filename,
                        "extraction": extraction,
                        "lang": _detect_lang(text),
                    },
                )
            )
        if not segments:
            raise ValueError("PDF has no extractable text even after OCR")
        return ParsedSource(title=filename, segments=segments)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_pdf.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/ingestion/pdf.py backend/requirements.txt backend/tests/test_pdf.py
git commit -m "feat(ingest): OCR fallback + page/filename/lang metadata for PDFs"
```

---

### Task 6: Citations include PDF filename + page

**Files:**
- Modify: `backend/app/rag/citations.py`
- Test: `backend/tests/test_citations.py`

**Interfaces:**
- Consumes: chunk metadata with `filename` + `page` (Task 5).
- Produces: `label_for(meta)` returns `"<filename> p.<page>"` for PDFs (e.g. `"deep-learning.pdf p.42"`), falling back to `"PDF p.<page>"` when filename is absent. Other source types unchanged. `chip_for` unchanged in shape.

- [ ] **Step 1: Update `backend/tests/test_citations.py`** — add/replace the PDF case:

```python
from app.rag.citations import chip_for, label_for


def test_pdf_label_includes_filename_and_page():
    meta = {"type": "pdf", "page": 42, "filename": "deep-learning.pdf"}
    assert label_for(meta) == "deep-learning.pdf p.42"


def test_pdf_label_without_filename_falls_back():
    assert label_for({"type": "pdf", "page": 7}) == "PDF p.7"


def test_chip_has_label_and_icon():
    chip = chip_for({"type": "pdf", "page": 3, "filename": "x.pdf"})
    assert chip["label"] == "x.pdf p.3"
    assert chip["icon"] == "file"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_citations.py -v`
Expected: FAIL (label is `PDF p.42`, not filename-prefixed).

- [ ] **Step 3: Update `label_for` in `backend/app/rag/citations.py`**

Replace the `pdf` branch:

```python
    if t == "pdf":
        page = meta.get("page")
        filename = meta.get("filename")
        return f"{filename} p.{page}" if filename else f"PDF p.{page}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_citations.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/rag/citations.py backend/tests/test_citations.py
git commit -m "feat(citations): PDF citations show filename + page"
```

---

### Task 7: Chunker tuned to 600 tokens / 15% overlap

**Files:**
- Modify: `backend/app/ingestion/chunker.py`
- Test: `backend/tests/test_chunker.py`

**Interfaces:**
- Produces: `chunk_segments(segments, max_tokens=600, overlap=90) -> list[Chunk]`; each `Chunk.metadata` is a copy of the source segment metadata (filename/page/etc. preserved); a `chunk_index` int is added to metadata.

- [ ] **Step 1: Update `backend/tests/test_chunker.py`** — add:

```python
from app.ingestion.chunker import chunk_segments


def test_defaults_are_600_90():
    import inspect
    sig = inspect.signature(chunk_segments)
    assert sig.parameters["max_tokens"].default == 600
    assert sig.parameters["overlap"].default == 90


def test_metadata_preserved_and_indexed():
    long_text = "word " * 2000  # > 600 tokens -> multiple chunks
    meta = {"type": "pdf", "page": 5, "filename": "x.pdf"}
    chunks = chunk_segments([(long_text, meta)])
    assert len(chunks) > 1
    assert all(c.metadata["filename"] == "x.pdf" for c in chunks)
    assert all(c.metadata["page"] == 5 for c in chunks)
    assert [c.metadata["chunk_index"] for c in chunks] == list(range(len(chunks)))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_chunker.py -v`
Expected: FAIL (defaults 500/50; no `chunk_index`).

- [ ] **Step 3: Update `backend/app/ingestion/chunker.py`**

```python
import tiktoken

from app.ingestion.base import Chunk

_enc = tiktoken.get_encoding("cl100k_base")


def chunk_segments(
    segments: list[tuple[str, dict]],
    max_tokens: int = 600,
    overlap: int = 90,
) -> list[Chunk]:
    """Token-chunk each segment independently so source metadata stays attached."""
    chunks: list[Chunk] = []
    for text, meta in segments:
        text = (text or "").strip()
        if not text:
            continue
        tokens = _enc.encode(text)
        if len(tokens) <= max_tokens:
            m = dict(meta)
            m["chunk_index"] = len(chunks)
            chunks.append(Chunk(content=text, metadata=m))
            continue
        start = 0
        while start < len(tokens):
            window = tokens[start : start + max_tokens]
            m = dict(meta)
            m["chunk_index"] = len(chunks)
            chunks.append(Chunk(content=_enc.decode(window), metadata=m))
            if start + max_tokens >= len(tokens):
                break
            start += max_tokens - overlap
    return chunks
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_chunker.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/ingestion/chunker.py backend/tests/test_chunker.py
git commit -m "feat(chunk): 600/15% chunking with preserved metadata + index"
```

---

### Task 8: Cross-encoder reranker + retriever wiring

**Files:**
- Create: `backend/app/rag/reranker.py`
- Modify: `backend/app/rag/retriever.py`
- Test: `backend/tests/test_reranker.py` (create), `backend/tests/test_retriever.py` (extend)

**Interfaces:**
- Consumes: `get_settings().reranker_model`, `rerank_enabled`, `retrieve_candidates`, `retrieval_top_k`, `retrieval_min_score`; `embed_query`, `match_chunks`.
- Produces:
  - `reranker.rerank(query: str, hits: list[dict], top_k: int) -> list[dict]` — adds `rerank_score` to each hit, returns the top_k sorted by it. Lazy cached `_get_reranker()`.
  - `retriever.retrieve(query, session_id, top_k, min_score) -> list[dict]` — embeds query, fetches `retrieve_candidates` from `match_chunks`, filters by `min_score` (retrieval similarity), reranks survivors (when `rerank_enabled`), returns top_k.
  - `retriever.build_context(hits)` unchanged.

- [ ] **Step 1: Write the failing reranker test** — `backend/tests/test_reranker.py`:

```python
from app.rag import reranker


class _FakeCE:
    def predict(self, pairs, **kw):
        # score = length of the candidate text (longer == more relevant, for the test)
        return [float(len(p[1])) for p in pairs]


def test_rerank_orders_by_cross_encoder(monkeypatch):
    monkeypatch.setattr(reranker, "_get_reranker", lambda: _FakeCE())
    hits = [
        {"content": "short", "metadata": {}},
        {"content": "a much longer chunk of text", "metadata": {}},
    ]
    out = reranker.rerank("q", hits, top_k=2)
    assert out[0]["content"] == "a much longer chunk of text"
    assert "rerank_score" in out[0]


def test_rerank_truncates_to_top_k(monkeypatch):
    monkeypatch.setattr(reranker, "_get_reranker", lambda: _FakeCE())
    hits = [{"content": f"c{i}" * i, "metadata": {}} for i in range(1, 6)]
    out = reranker.rerank("q", hits, top_k=2)
    assert len(out) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_reranker.py -v`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `backend/app/rag/reranker.py`**

```python
from functools import lru_cache

from app.config import get_settings


@lru_cache
def _get_reranker():
    from sentence_transformers import CrossEncoder

    return CrossEncoder(get_settings().reranker_model)


def rerank(query: str, hits: list[dict], top_k: int) -> list[dict]:
    if not hits:
        return []
    ce = _get_reranker()
    scores = ce.predict([(query, h["content"]) for h in hits], show_progress_bar=False)
    for h, s in zip(hits, scores):
        h["rerank_score"] = float(s)
    ranked = sorted(hits, key=lambda h: h["rerank_score"], reverse=True)
    return ranked[:top_k]
```

- [ ] **Step 4: Run reranker test to verify it passes**

Run: `cd backend && python -m pytest tests/test_reranker.py -v`
Expected: PASS.

- [ ] **Step 5: Update `backend/app/rag/retriever.py`**

```python
from app.config import get_settings
from app.rag import reranker
from app.rag.citations import label_for
from app.rag.embeddings import embed_query
from app.repository import match_chunks


def retrieve(query: str, session_id: str, top_k: int, min_score: float) -> list[dict]:
    s = get_settings()
    emb = embed_query(query)
    hits = match_chunks(emb, session_id, s.retrieve_candidates)
    hits = [h for h in hits if h.get("similarity", 0) >= min_score]
    if not hits:
        return []
    if s.rerank_enabled:
        return reranker.rerank(query, hits, top_k)
    return hits[:top_k]


def build_context(hits: list[dict]) -> str:
    blocks = []
    for h in hits:
        blocks.append(f"[{label_for(h['metadata'])}]\n{h['content']}")
    return "\n\n".join(blocks)
```

- [ ] **Step 6: Extend `backend/tests/test_retriever.py`** — append:

```python
def test_retrieve_reranks_when_enabled(monkeypatch):
    from app.rag import retriever as rr
    monkeypatch.setattr(rr, "embed_query", lambda q: [0.0])
    monkeypatch.setattr(
        rr, "match_chunks",
        lambda emb, sid, k: [
            {"content": "weak match", "metadata": {}, "similarity": 0.9},
            {"content": "strong relevant answer", "metadata": {}, "similarity": 0.5},
        ],
    )
    monkeypatch.setattr(
        rr.reranker, "rerank",
        lambda q, hits, top_k: sorted(hits, key=lambda h: len(h["content"]), reverse=True)[:top_k],
    )
    monkeypatch.setattr(rr, "get_settings", lambda: type("S", (), {
        "retrieve_candidates": 20, "rerank_enabled": True})())
    out = rr.retrieve("q", "sess", top_k=1, min_score=0.3)
    assert out[0]["content"] == "strong relevant answer"
```

- [ ] **Step 7: Run all retriever/reranker tests**

Run: `cd backend && python -m pytest tests/test_retriever.py tests/test_reranker.py -v`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/rag/reranker.py backend/app/rag/retriever.py backend/tests/test_reranker.py backend/tests/test_retriever.py
git commit -m "feat(retrieve): bge-reranker cross-encoder over top-20 candidates"
```

---

### Task 9: Corpus ingestion script + retrieve against the corpus

**Files:**
- Create: `backend/scripts/corpus_manifest.json`
- Create: `backend/scripts/ingest_corpus.py`
- Modify: `backend/app/routers/chat.py` (retrieve from `corpus_session_id`)
- Test: `backend/tests/test_ingest_corpus.py` (create)

**Interfaces:**
- Consumes: `repository.ensure_session/create_source/update_source`, `ingestion.service.process_source` (existing — runs parse→chunk→embed→insert), `get_settings().corpus_session_id`.
- Produces:
  - `corpus_manifest.json` — list of `{ "filename": str, "url": str }` for ~10 CS/ML PDFs (≥200 pages each; include 2–3 scanned).
  - `ingest_corpus.py` with `download(entry, dest_dir) -> str` and `main()` that ensures the corpus session, downloads each PDF, and ingests it via `process_source`.
  - Chat retrieval now targets the fixed corpus knowledge base.

- [ ] **Step 1: Write `backend/scripts/corpus_manifest.json`**

Curate ~10 public-domain / openly-licensed CS/ML PDFs, each ≥200 pages, including 2–3 scanned. Example seed (verify each URL resolves and page count ≥200 before committing; swap any dead link):

```json
[
  {"filename": "sicp.pdf", "url": "https://web.mit.edu/6.001/6.037/sicp.pdf"},
  {"filename": "mathematics-for-cs.pdf", "url": "https://courses.csail.mit.edu/6.042/spring18/mcs.pdf"},
  {"filename": "deep-learning-goodfellow.pdf", "url": "https://raw.githubusercontent.com/janishar/mit-deep-learning-book-pdf/master/complete-book-pdf/deeplearningbook.pdf"},
  {"filename": "elements-of-statistical-learning.pdf", "url": "https://hastie.su.domains/ElemStatLearn/printings/ESLII_print12_toc.pdf"},
  {"filename": "intro-to-statistical-learning.pdf", "url": "https://www.statlearning.com/s/ISLRv2_website.pdf"},
  {"filename": "dive-into-deep-learning.pdf", "url": "https://d2l.ai/d2l-en.pdf"},
  {"filename": "reinforcement-learning-sutton.pdf", "url": "http://incompleteideas.net/book/RLbook2020.pdf"},
  {"filename": "speech-and-language-processing.pdf", "url": "https://web.stanford.edu/~jurafsky/slp3/ed3book.pdf"},
  {"filename": "boyd-convex-optimization.pdf", "url": "https://web.stanford.edu/~boyd/cvxbook/bv_cvxbook.pdf"},
  {"filename": "information-theory-mackay.pdf", "url": "https://www.inference.org.uk/itprnn/book.pdf"}
]
```

- [ ] **Step 2: Write the failing test** — `backend/tests/test_ingest_corpus.py`:

```python
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_ingest_corpus.py -v`
Expected: FAIL (module not found).

- [ ] **Step 4: Write `backend/scripts/__init__.py`** (empty) and `backend/scripts/ingest_corpus.py`

```python
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_ingest_corpus.py -v`
Expected: PASS.

- [ ] **Step 6: Point chat retrieval at the corpus** — in `backend/app/routers/chat.py`, the retrieval call currently passes the request's session id. Change retrieval (NOT history) to use the corpus session. Find the `retrieve(...)` call and replace its `session_id` argument with `get_settings().corpus_session_id`; add `from app.config import get_settings` if missing. The message-history and `ensure_session(req.session_id)` calls stay on `req.session_id`.

- [ ] **Step 7: Run the full ingestion (operational, one-time)** — requires DB up (Task 1) and Tesseract installed (Task 5)

Run: `cd backend && python -m scripts.ingest_corpus`
Expected: each PDF prints `ingested`. Verify counts:
```bash
docker compose exec -T db psql -U rag -d rag -c \
"select s.title, count(*) from chunks c join sources s on s.id=c.source_id group by s.title order by 2 desc;"
```
Expected: ≥10 sources, thousands of chunks total.

- [ ] **Step 8: Commit**

```bash
git add backend/scripts backend/app/routers/chat.py backend/tests/test_ingest_corpus.py
git commit -m "feat(corpus): scripted CS/ML PDF ingestion into fixed corpus session"
```

---

### Task 10: Evaluation harness

**Files:**
- Create: `backend/eval/__init__.py`, `backend/eval/metrics.py`, `backend/eval/goldset.jsonl`, `backend/eval/run_eval.py`
- Test: `backend/tests/test_metrics.py` (create)

**Interfaces:**
- Consumes: `retriever.retrieve`, `retriever.build_context`, `generator.stream_answer`, `get_openai` (for the hallucination LLM-judge), `get_settings`.
- Produces:
  - `metrics.recall_at_k(retrieved_pages: list[int], gold_pages: list[int], k: int) -> float`
  - `metrics.mrr(retrieved_pages: list[int], gold_pages: list[int]) -> float`
  - `metrics.percentile(values: list[float], p: float) -> float`
  - `run_eval.main()` → writes `backend/eval/report.md` with latency p50/p95, Recall@k, MRR, citation accuracy, hallucination rate.
  - `goldset.jsonl` lines: `{"question": str, "filename": str, "gold_pages": [int], "answer_substring": str}`.

- [ ] **Step 1: Write the failing metrics test** — `backend/tests/test_metrics.py`:

```python
from eval import metrics


def test_recall_at_k():
    assert metrics.recall_at_k([3, 9, 4], [4], k=3) == 1.0
    assert metrics.recall_at_k([3, 9, 8], [4], k=3) == 0.0
    assert metrics.recall_at_k([4, 9, 8], [4], k=1) == 1.0


def test_mrr():
    assert metrics.mrr([9, 4, 7], [4]) == 0.5      # gold first appears at rank 2
    assert metrics.mrr([4, 9, 7], [4]) == 1.0
    assert metrics.mrr([1, 2, 3], [4]) == 0.0


def test_percentile():
    assert metrics.percentile([1, 2, 3, 4], 50) == 2.5
    assert metrics.percentile([10], 95) == 10
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_metrics.py -v`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `backend/eval/__init__.py`** (empty) and `backend/eval/metrics.py`

```python
def recall_at_k(retrieved_pages: list[int], gold_pages: list[int], k: int) -> float:
    topk = retrieved_pages[:k]
    return 1.0 if any(p in topk for p in gold_pages) else 0.0


def mrr(retrieved_pages: list[int], gold_pages: list[int]) -> float:
    for rank, page in enumerate(retrieved_pages, start=1):
        if page in gold_pages:
            return 1.0 / rank
    return 0.0


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    xs = sorted(values)
    if len(xs) == 1:
        return float(xs[0])
    idx = (p / 100) * (len(xs) - 1)
    lo = int(idx)
    frac = idx - lo
    hi = min(lo + 1, len(xs) - 1)
    return float(xs[lo] + (xs[hi] - xs[lo]) * frac)
```

- [ ] **Step 4: Run metrics test to verify it passes**

Run: `cd backend && python -m pytest tests/test_metrics.py -v`
Expected: PASS.

- [ ] **Step 5: Author `backend/eval/goldset.jsonl`** — write ~25 real Q&A authored against the ingested corpus (Task 9). Each line targets a known fact at a known page. Three real seed examples (expand to ~25 after reading the corpus):

```json
{"question": "What does the bias-variance tradeoff describe?", "filename": "intro-to-statistical-learning.pdf", "gold_pages": [33, 34], "answer_substring": "variance"}
{"question": "What is the Bellman equation in reinforcement learning?", "filename": "reinforcement-learning-sutton.pdf", "gold_pages": [59], "answer_substring": "value"}
{"question": "Define a convex set.", "filename": "boyd-convex-optimization.pdf", "gold_pages": [23], "answer_substring": "line segment"}
```

- [ ] **Step 6: Write `backend/eval/run_eval.py`**

```python
import json
import pathlib
import time

from app.config import get_settings
from app.openai_client import get_openai
from app.rag.generator import stream_answer
from app.rag.retriever import build_context, retrieve
from eval.metrics import mrr, percentile, recall_at_k

GOLD = pathlib.Path(__file__).parent / "goldset.jsonl"
REPORT = pathlib.Path(__file__).parent / "report.md"
TOP_K = 6


def _judge_grounded(answer: str, context: str) -> bool:
    prompt = (
        "You are a strict grader. Reply with only YES or NO. "
        "Is EVERY factual claim in the ANSWER supported by the CONTEXT?\n\n"
        f"CONTEXT:\n{context}\n\nANSWER:\n{answer}"
    )
    resp = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
    )
    return resp.choices[0].message.content.strip().upper().startswith("YES")


def main() -> None:
    s = get_settings()
    rows = [json.loads(line) for line in GOLD.read_text().splitlines() if line.strip()]
    latencies, recalls, rrs, cite_ok, grounded = [], [], [], [], []

    for row in rows:
        t0 = time.perf_counter()
        hits = retrieve(row["question"], s.corpus_session_id, TOP_K, s.retrieval_min_score)
        context = build_context(hits)
        answer = "".join(stream_answer(row["question"], context, history=[]))
        latencies.append(time.perf_counter() - t0)

        pages = [h["metadata"].get("page") for h in hits
                 if h["metadata"].get("filename") == row["filename"]]
        recalls.append(recall_at_k(pages, row["gold_pages"], TOP_K))
        rrs.append(mrr(pages, row["gold_pages"]))
        cite_ok.append(1.0 if row["answer_substring"].lower() in answer.lower() else 0.0)
        grounded.append(1.0 if _judge_grounded(answer, context) else 0.0)

    n = len(rows)
    report = (
        f"# RAG Eval Report\n\n"
        f"- Questions: {n}\n"
        f"- Latency p50: {percentile(latencies, 50):.2f}s\n"
        f"- Latency p95: {percentile(latencies, 95):.2f}s\n"
        f"- Recall@{TOP_K}: {sum(recalls)/n:.2%}\n"
        f"- MRR: {sum(rrs)/n:.3f}\n"
        f"- Citation accuracy: {sum(cite_ok)/n:.2%}\n"
        f"- Hallucination rate: {1 - sum(grounded)/n:.2%}\n"
    )
    REPORT.write_text(report)
    print(report)


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Run the eval (operational, after corpus ingest)**

Run: `cd backend && python -m eval.run_eval`
Expected: prints the report; `backend/eval/report.md` written; p95 within 2–5s.

- [ ] **Step 8: Commit**

```bash
git add backend/eval backend/tests/test_metrics.py
git commit -m "feat(eval): R@k/MRR/latency/citation/hallucination harness"
```

---

### Task 11: Retrieval Inspector (API + UI)

**Files:**
- Create: `backend/app/routers/retrieval.py`
- Modify: `backend/app/main.py` (register router)
- Modify: `backend/app/models/schemas.py` (request/response models)
- Create: frontend `frontend/components/RetrievalInspector.tsx`
- Modify: a frontend chat view to mount the panel (e.g. `frontend/app/.../page.tsx` — locate the chat container)
- Test: `backend/tests/test_retrieval_route.py` (create)

**Interfaces:**
- Consumes: `retriever.retrieve` (which now attaches `similarity` + `rerank_score`), `get_settings().corpus_session_id`.
- Produces: `POST /retrieve` taking `{"query": str, "top_k": int=6}` returning `{"results": [{"content","filename","page","similarity","rerank_score"}]}`.

- [ ] **Step 1: Write the failing route test** — `backend/tests/test_retrieval_route.py`:

```python
from fastapi.testclient import TestClient

import app.routers.retrieval as route
from app.main import app


def test_retrieve_endpoint_returns_scored_results(monkeypatch):
    monkeypatch.setattr(
        route, "retrieve",
        lambda q, sid, k, ms: [
            {"content": "chunk text", "similarity": 0.71, "rerank_score": 4.2,
             "metadata": {"filename": "x.pdf", "page": 12}},
        ],
    )
    client = TestClient(app)
    r = client.post("/retrieve", json={"query": "what is gradient descent", "top_k": 6})
    assert r.status_code == 200
    res = r.json()["results"][0]
    assert res["filename"] == "x.pdf"
    assert res["page"] == 12
    assert res["similarity"] == 0.71
    assert res["rerank_score"] == 4.2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_retrieval_route.py -v`
Expected: FAIL (route module not found / 404).

- [ ] **Step 3: Add schemas to `backend/app/models/schemas.py`** (append):

```python
class RetrieveRequest(BaseModel):
    query: str
    top_k: int = 6


class RetrievedChunk(BaseModel):
    content: str
    filename: str | None = None
    page: int | None = None
    similarity: float | None = None
    rerank_score: float | None = None


class RetrieveResponse(BaseModel):
    results: list[RetrievedChunk]
```

(If `BaseModel` isn't already imported at the top of the file, add `from pydantic import BaseModel`.)

- [ ] **Step 4: Write `backend/app/routers/retrieval.py`**

```python
from fastapi import APIRouter

from app.config import get_settings
from app.models.schemas import RetrievedChunk, RetrieveRequest, RetrieveResponse
from app.rag.retriever import retrieve

router = APIRouter()


@router.post("/retrieve", response_model=RetrieveResponse)
def retrieve_chunks(req: RetrieveRequest) -> RetrieveResponse:
    s = get_settings()
    hits = retrieve(req.query, s.corpus_session_id, req.top_k, s.retrieval_min_score)
    results = [
        RetrievedChunk(
            content=h["content"],
            filename=h["metadata"].get("filename"),
            page=h["metadata"].get("page"),
            similarity=h.get("similarity"),
            rerank_score=h.get("rerank_score"),
        )
        for h in hits
    ]
    return RetrieveResponse(results=results)
```

- [ ] **Step 5: Register the router in `backend/app/main.py`** — add `retrieval` to the import and `app.include_router(retrieval.router)`:

```python
from app.routers import chat, quiz, retrieval, sources, voice
...
app.include_router(retrieval.router)
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_retrieval_route.py -v`
Expected: PASS.

- [ ] **Step 7: Build the frontend panel** — `frontend/components/RetrievalInspector.tsx`

```tsx
"use client";
import { useState } from "react";

type Chunk = {
  content: string;
  filename: string | null;
  page: number | null;
  similarity: number | null;
  rerank_score: number | null;
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function RetrievalInspector() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, top_k: 6 }),
      });
      const data = await r.json();
      setResults(data.results ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <h2 className="font-semibold">Retrieval Inspector</h2>
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-2 py-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Inspect top-K retrieved chunks…"
        />
        <button className="border rounded px-3 py-1" onClick={run} disabled={loading}>
          {loading ? "…" : "Retrieve"}
        </button>
      </div>
      <ol className="space-y-2">
        {results.map((c, i) => (
          <li key={i} className="border rounded p-2 text-sm">
            <div className="font-mono text-xs opacity-70">
              {c.filename} p.{c.page} · sim {c.similarity?.toFixed(3)} · rerank{" "}
              {c.rerank_score?.toFixed(2)}
            </div>
            <p className="mt-1 line-clamp-4">{c.content}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 8: Mount the panel** — locate the chat page/container under `frontend/app/` and render `<RetrievalInspector />` in a side panel or a dedicated `/inspect` route. Run:
```bash
cd frontend && grep -rl "useState\|chat" app | head
```
Pick the chat container and add the import + component. Verify it builds:
```bash
cd frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add backend/app/routers/retrieval.py backend/app/main.py backend/app/models/schemas.py backend/tests/test_retrieval_route.py frontend/components/RetrievalInspector.tsx frontend/app
git commit -m "feat(demo): Retrieval Inspector API + UI panel"
```

---

### Task 12: Full suite + end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole backend test suite**

Run: `cd backend && python -m pytest -q`
Expected: all tests pass (existing 52 + new). Fix any that broke from the data-layer/embeddings swap.

- [ ] **Step 2: Start backend + frontend and do a manual query**

Run:
```bash
cd /Users/salescode/development/samasocial-learning-assistant
docker compose up -d db
(cd backend && ./run.sh &)
(cd frontend && npm run dev &)
```
Open the app, ask a corpus question, confirm: answer in 2–5s, citation shows `filename p.N`, and the Retrieval Inspector lists top-K chunks with similarity + rerank scores.

- [ ] **Step 3: Run the eval and confirm targets**

Run: `cd backend && python -m eval.run_eval`
Expected: `report.md` shows p95 latency 2–5s and non-trivial Recall@6 / MRR / citation accuracy.

- [ ] **Step 4: Update README** — add a "Challenge 1 (local OSS RAG)" section: `docker compose up -d db`, install Tesseract, `pip install -r requirements.txt`, `python -m scripts.ingest_corpus`, run backend/frontend, `python -m eval.run_eval`. Commit:

```bash
git add README.md backend/eval/report.md
git commit -m "docs: Challenge 1 local OSS RAG setup + eval results"
```

---

## Self-Review

**Spec coverage:**
- Ingestion & Preprocessing (OCR, clean, lang) → Task 5 ✅
- Chunking & Metadata (600/15%, page/filename) → Tasks 5, 7 ✅
- Embedding (OSS BGE) → Task 4 ✅
- Indexing & Retrieval (pgvector HNSW, top-K + scores) → Tasks 1, 3, 8 ✅
- Reranking (cross-encoder) → Task 8 ✅
- Generation w/ provenance → reused generator + Task 6 citations ✅
- Latency 2–5s → Tasks 1 (local), 8 (rerank budget), 12 (verify) ✅
- Evaluation (p95, R@k, MRR, citation, hallucination) → Task 10 ✅
- Deliverable: ingestion pipeline → Task 9; retrieval visualization → Task 11; cited answer → Tasks 6/12 ✅
- Open/Free embeddings + DB → Tasks 4, 1/3 ✅
- Reproducibility (scripted corpus, persisted embeddings, deterministic chunking) → Tasks 9, 3, 7 ✅

**Placeholder scan:** Gold-set data (Task 10 Step 5) and the corpus manifest (Task 9 Step 1) are *data* that must be finalized against real downloaded PDFs — flagged as such, with concrete seed entries and verification commands, not code placeholders. All code steps contain full implementations.

**Type consistency:** `embed_query`/`embed_texts` signatures preserved across Tasks 4/8/10/11. `retrieve(query, session_id, top_k, min_score)` consistent in Tasks 8/10/11. `match_chunks` returns `similarity`; `reranker.rerank` adds `rerank_score`; both surfaced in Task 11. `label_for` filename behavior (Task 6) consumed by `build_context` (Task 8). Repository public signatures unchanged so existing routers/quiz keep working.

**Known operational dependencies:** Docker DB (Task 1) must be up for Tasks 3/9/10/12 integration steps; `brew install tesseract` for Tasks 5/9; first model use downloads BGE + reranker weights.
