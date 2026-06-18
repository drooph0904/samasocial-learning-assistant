# Samasocial — Multi-Source AI Learning Assistant (Task 1)

A web app that ingests **YouTube videos, PDFs, PowerPoint decks, and public webpages**, builds a retrieval index over them, and answers questions grounded **strictly** in that content — with token-by-token streaming, session memory, source citations ("Slide 4" / "Video 3:22"), voice input, and a built-in quiz module.

> Built for the Samasocial technical assignment (Task 1). All the logic — chunking, retrieval, prompting, streaming, grading — is custom; no pre-built chatbot SaaS.

## Live demo
- **App:** https://samasocial-learning-assistant.vercel.app _(Vercel)_
- **API:** https://samasocial-backend.onrender.com (`/health`, `/docs`) _(Render)_

> First request after a lull may take ~30–60s while the free-tier backend wakes (see [Documented limitations](#documented-limitations)).

---

## Features

### Core (assignment requirements)
- **Mix any sources in one chat** — YouTube + PDF + PPTX + webpage together.
- **Grounded RAG answers** — vector retrieval over chunks; never dumps the whole document.
- **Streaming** responses (Server-Sent Events, token by token).
- **Session memory** — follow-ups work naturally; history persists and restores per chat.
- **Citations** — inline + clickable **source chips** that preview the exact excerpt; "Slide 3", "Video 3:22", "PDF p.4", "Web: …".
- **Explain-simply / doubt resolution** for any phrasing (history-aware query rewriting).
- **Graceful out-of-scope decline** (similarity threshold + grounding prompt); a deleted source becomes unanswerable.

### Bonus (all three from the brief) + extras
- **Multi-source attribution** — each answer shows which sources it used.
- **Quiz module** — pick sources, choose **Multiple-choice + Written** counts and **difficulty**; take it (hints with a budget, jump-dots, char counter), **auto-grade** (MCQ exact, written graded by LLM with partial credit), **score ring + review**, **retry incorrect**, and export **blank test / answer key / graded report** PDFs.
- **Per-source summary** — a short headline + 3-4 line description generated on ingest.
- **Voice input** (chatbot) — record a question, transcribed via OpenAI Whisper.
- **Multi-chat** — searchable sidebar, AI-named chats, multi-select bulk delete.
- **Source management** — drag-drop upload, detail modal, retry, multi-select bulk delete.
- **Dark / light theme** (Discord-inspired dark by default).

---

## Architecture

```
Next.js (App Router, TS)  ──HTTP / SSE──►  FastAPI  ──►  OpenAI (chat · embeddings · whisper)
   chat · sources · quiz UI                    │
                                               └──►  Supabase Postgres + pgvector
                                                     (sessions, sources, chunks, messages, quizzes)
```

- **Frontend** (`frontend/`) — presentation + streaming only.
- **Backend** (`backend/`) — ingestion, chunking, embedding, retrieval, generation, grading, persistence.

**Retrieval & citations:** every chunk stores its source identity in a `metadata` JSON column (`page` / `slide` / `start_seconds` / `url`). Retrieval injects source-labeled context (`[Slide 3]`, `[Video 3:22]`) so the model cites those labels, and the UI renders matching chips. One design gives grounding + citations + multi-source attribution.

### Backend layout
```
backend/app/
  config.py                     # env config (pydantic-settings)
  db.py / repository.py         # Supabase client (per-thread) + data access (+ retry)
  openai_client.py
  util.py                       # is_uuid (id validation)
  quiz_store.py                 # quiz persistence (Supabase) + hint budget
  transcribe.py                 # Whisper transcription
  ingestion/
    base.py                     # Chunk / ParsedSource / Parser protocol
    pdf.py pptx.py youtube.py webpage.py
    chunker.py                  # token chunking (~500 tok, 50 overlap)
    service.py                  # parse -> chunk -> embed -> store -> describe
  rag/
    embeddings.py retriever.py generator.py contextualizer.py
    summarizer.py grader.py quiz.py citations.py
  routers/
    sources.py chat.py quiz.py voice.py
  sql/schema.sql
```

## Tech stack
FastAPI · Python 3.13 · Next.js 16 (App Router, TS) · Tailwind v4 · lucide-react · react-markdown · Supabase Postgres + pgvector · OpenAI (`gpt-4o-mini`, `text-embedding-3-small`, `whisper-1`) · pytest.

---

## Setup

### Prerequisites
- Python 3.11+, Node 18+
- An **OpenAI API key**
- A **Supabase** project (free tier)

### 1. Supabase schema
In the Supabase **SQL Editor**, run the contents of [`backend/sql/schema.sql`](backend/sql/schema.sql). It enables `pgvector` and creates `sessions`, `sources`, `chunks`, `messages`, `quizzes` plus the `match_chunks` similarity function. From **Project Settings → API**, copy the **Project URL** and the **service_role / secret** key.

### 2. Backend
```bash
cd backend
cp .env.example .env          # fill in the values below
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
./run.sh                      # uvicorn on http://localhost:8000
```

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI key |
| `OPENAI_CHAT_MODEL` | default `gpt-4o-mini` |
| `OPENAI_EMBED_MODEL` | default `text-embedding-3-small` |
| `OPENAI_TRANSCRIBE_MODEL` | default `whisper-1` (voice input) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role / secret key |
| `RETRIEVAL_TOP_K` | chunks retrieved per query (default 6) |
| `RETRIEVAL_MIN_SCORE` | similarity floor / out-of-scope guard (default 0.40) |
| `CORS_ORIGINS` | comma-separated allowed origins (default `http://localhost:3000`) |

### 3. Frontend
```bash
cd frontend
cp .env.local.example .env.local   # NEXT_PUBLIC_API_BASE=http://localhost:8000
npm install
npm run dev                        # http://localhost:3000
```

## Tests
```bash
cd backend && ./.venv/bin/python -m pytest -q     # 52 tests; OpenAI/Supabase mocked
```
Covers chunking, every parser, retrieval + out-of-scope guard, citations, generation, summary/headline, quiz generation/grading/hints, transcription, id validation, embeddings batching.

---

## Key design decisions
- **Metadata-tagged chunks in one pgvector index** — clean cross-source ranking + citations from a single store.
- **Async ingestion + polling** — `POST /sources` returns `processing`; the UI polls to `ready`. Batched inserts/embeddings handle long videos (1000s of chunks).
- **History-aware query rewriting** — a follow-up is condensed into a standalone query before retrieval, so any phrasing ("explain simpler", "but why?") retrieves the right chunks.
- **Grounding guarantees** — facts must come from retrieved context/sources, not conversation memory; below-threshold retrieval triggers a graceful decline.
- **Quizzes persisted in Supabase** — survive restarts and multiple instances; answers stay server-side (never sent to the client until grading).
- **Per-thread Supabase client + transient retry** — robust under the rapid concurrent polling.

## Documented limitations
- **OCR** for scanned/image-only PDFs is not supported.
- **No Whisper fallback** for YouTube videos that have no captions in any language (they're marked `error`).
- **Anonymous, browser-scoped sessions** — no auth/accounts; chat list lives in `localStorage`.
- **Free-tier hosting cold start** — the Render backend sleeps after ~15 min idle, so the first request after a lull takes ~30–60s to wake. The app pings `/health` on load to warm it; a keep-alive cron (or a paid tier) removes the lag entirely.

## Repo notes
- Secrets live only in `.env` (gitignored, never committed).
- Commit history is intentionally granular to show how it was built.
