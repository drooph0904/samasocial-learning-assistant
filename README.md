# Samasocial — Multi-Source AI Learning Assistant (Task 1)

A web-based AI chatbot that ingests **YouTube videos, PDFs, PowerPoint decks, and public webpages**, builds a retrieval index over them, and answers questions grounded **strictly** in that content — with token-by-token streaming, session memory, source citations ("PDF p.4", "video 3:22"), and graceful out-of-scope handling.

> Built for the Samasocial technical assignment. The logic (chunking, retrieval, prompting, streaming) is all custom — no pre-built chatbot SaaS.

## Features

**Core**
- Mix & combine sources in one session (e.g. a PDF + a YouTube video together)
- Retrieval-augmented answers (vector search over chunks — never dumps the whole document)
- Streaming responses (Server-Sent Events, token by token)
- Session memory — follow-up questions work naturally; history persists per session
- Inline citations + per-answer **source chips** showing exactly where each answer came from
- Graceful decline when a question is outside the loaded material

**Bonus (all three implemented)**
- **Multi-source attribution** — each answer shows chips for every source it drew from
- **Quiz me mode** — auto-generates grounded questions from the loaded content
- **Per-source summaries** — a short summary appears on each source card once processed

## Architecture

```
Next.js (App Router)  ──HTTP / SSE──►  FastAPI  ──►  OpenAI (chat + embeddings)
   split-panel UI: sources | chat              │
                                               └──►  Supabase Postgres + pgvector
                                                     (sessions, sources, chunks, messages)
```

- **Frontend** (`frontend/`) — presentation + streaming only. Split panel: sources on the left, chat/quiz on the right.
- **Backend** (`backend/`) — owns ingestion, chunking, embedding, retrieval, generation, and persistence.

### How retrieval + citations work
Every chunk stores its source identity in a `metadata` JSON column (`page`, `slide`, `start_seconds`, `url`). At retrieval the chunks are injected into the prompt with explicit labels like `[PDF p.4]` / `[Video 3:22]`, so the model cites from those labels and the UI can render source chips. This single design gives grounded citations **and** multi-source attribution for free.

### Backend module map
```
backend/app/
  config.py              # env config (pydantic-settings)
  db.py / repository.py  # Supabase client + data-access layer
  openai_client.py       # OpenAI client
  ingestion/
    base.py              # Chunk + ParsedSource + Parser protocol
    pdf.py pptx.py youtube.py webpage.py   # one parser per source, uniform output
    chunker.py           # token-based chunking (~500 tok, 50 overlap)
    service.py           # parse -> chunk -> embed -> store -> summarize
  rag/
    embeddings.py retriever.py generator.py summarizer.py quiz.py citations.py
  routers/
    sources.py chat.py quiz.py
```

## Tech stack
FastAPI · Python 3.13 · Next.js 16 (App Router, TS) · Tailwind CSS · Supabase Postgres + pgvector · OpenAI (`gpt-4o-mini` chat, `text-embedding-3-small` embeddings) · pytest

## Setup

### Prerequisites
- Python 3.11+ and Node 18+
- An **OpenAI API key**
- A **Supabase** project (free tier)

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run the contents of [`backend/sql/schema.sql`](backend/sql/schema.sql). This enables `pgvector` and creates the `sessions`, `sources`, `chunks`, `messages` tables plus the `match_chunks` function.
3. From **Project Settings → API**, copy the **Project URL** and the **`service_role`** secret key.

### 2. Backend
```bash
cd backend
cp .env.example .env        # then fill in the values below
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
./run.sh                    # starts uvicorn on http://localhost:8000
```

`.env` values:

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Your OpenAI key |
| `OPENAI_CHAT_MODEL` | default `gpt-4o-mini` |
| `OPENAI_EMBED_MODEL` | default `text-embedding-3-small` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase `service_role` key |
| `RETRIEVAL_TOP_K` | chunks retrieved per query (default 6) |
| `RETRIEVAL_MIN_SCORE` | similarity floor for the out-of-scope guard (default 0.25) |
| `CORS_ORIGINS` | comma-separated allowed origins (default `http://localhost:3000`) |

### 3. Frontend
```bash
cd frontend
cp .env.local.example .env.local     # NEXT_PUBLIC_API_BASE=http://localhost:8000
npm install
npm run dev                          # http://localhost:3000
```

## Tests
```bash
cd backend && ./.venv/bin/python -m pytest -q
```
All OpenAI/Supabase calls are mocked; the suite covers chunking, every parser, retrieval + out-of-scope guard, citation formatting, generation, summary/quiz, and the ingestion orchestration.

## Key design decisions
- **Metadata-tagged chunks in one pgvector index** (vs. one index per source) — clean cross-source ranking and citations from a single store.
- **Async ingestion + polling** — `POST /sources` returns immediately with `status=processing`; the UI polls until `ready`. Long videos / large PDFs never time out the request.
- **Out-of-scope guard** — if the best retrieval similarity is below a threshold, the assistant declines instead of hallucinating.
- **Uniform parser abstraction** — every source type emits the same `Chunk{content, metadata}`, so adding a new source type is isolated to one file.
- **Streaming via SSE** — simple, proxy-friendly, easy to consume from the browser `ReadableStream`.

## Documented limitations
- **OCR** for scanned / image-only PDFs is not supported (text-extractable PDFs only).
- **No Whisper fallback** — if a YouTube video has no transcript available, the source is marked `error`.
- **Anonymous, browser-scoped sessions** — no auth / multi-user accounts. Session id lives in `localStorage`.
- **Local only** — not deployed in this iteration (deployment is a documented next step).
