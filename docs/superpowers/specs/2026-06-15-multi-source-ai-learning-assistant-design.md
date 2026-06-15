# Multi-Source AI Learning Assistant — Design Spec

**Date:** 2026-06-15
**Assignment:** Samasocial Technical Assignment — Task 1
**Author:** Dhruv Garg

## 1. Goal

A web-based AI chatbot that ingests one or more knowledge sources (YouTube URL, PDF, PPTX, public webpage), builds a retrieval index over them, and answers questions grounded **strictly** in that content — with streaming responses, session memory, source citations, and graceful out-of-scope handling.

## 2. Stack

- **Backend:** FastAPI (Python 3.13)
- **Frontend:** Next.js (App Router, TypeScript)
- **Database / Vector store:** Supabase Postgres + `pgvector`
- **LLM:** OpenAI — `gpt-4o-mini` (chat), `text-embedding-3-small` (embeddings, 1536-dim)
- **Deployment:** Local for now (deployment is a documented future step)

## 3. Architecture

```
Next.js (App Router)  ──HTTP/SSE──►  FastAPI  ──►  OpenAI (chat + embeddings)
   split UI: sources + chat                │
                                           └──►  Supabase Postgres + pgvector
                                                 (sessions, sources, chunks, messages)
```

Two services with clean separation of concerns:
- **Frontend** — presentation + streaming consumption only. No business logic.
- **Backend** — owns ingestion, chunking, embedding, retrieval, generation, persistence.

## 4. Retrieval & Citation Strategy (core decision)

**Metadata-tagged chunks in a single pgvector index.** Every chunk stores its source identity in a `jsonb` metadata column:

| Source | Metadata captured | Citation rendered |
|--------|-------------------|-------------------|
| PDF | `{page}` | "📄 PDF p.4" |
| PPTX | `{slide}` | "▭ Slide 4" |
| YouTube | `{start_seconds}` | "▶ 3:22" |
| Webpage | `{url, title}` | "🌐 <title>" |

At retrieval, chunks are injected into the prompt with explicit labels (`[PDF p.4]`, `[Video 3:22]`). The model cites using those labels. The retrieved chunks' metadata is also returned to the UI so it can render **source chips under each answer** — which simultaneously satisfies the multi-source attribution bonus.

Rejected alternatives: separate index per source (messy cross-source ranking); full-document-in-prompt (explicitly forbidden by the assignment).

## 5. Backend Structure

```
backend/
  app/
    main.py                # FastAPI app, CORS, router mounting
    config.py              # pydantic-settings, env vars
    db.py                  # Supabase client
    models/schemas.py      # Pydantic request/response models
    ingestion/
      base.py              # Chunk dataclass + Parser protocol
      pdf.py               # PyMuPDF -> page-numbered text
      pptx.py              # python-pptx -> slide-numbered text
      youtube.py           # youtube-transcript-api -> timestamped segments
      webpage.py           # trafilatura/BeautifulSoup -> main text
      chunker.py           # token-based chunking (~500 tok, 50 overlap, tiktoken)
    rag/
      embeddings.py        # OpenAI embeddings (batched)
      retriever.py         # pgvector cosine top-k, session-scoped + score guard
      generator.py         # streaming answer, grounding+citation system prompt
      summarizer.py        # per-source summary
      quiz.py              # quiz generation
    routers/
      sources.py           # POST /sources, GET /sources, GET /sources/{id}
      chat.py              # POST /chat (SSE stream)
      quiz.py              # POST /quiz
  requirements.txt
  .env.example
```

All parsers emit the same shape: `Chunk{content: str, metadata: dict}`. This is the key abstraction that keeps ingestion uniform.

### Async ingestion

`POST /sources` (file upload or URL) returns immediately with `status=processing` and a `source_id`. A FastAPI `BackgroundTask` runs: parse → chunk → embed → store → generate summary → set `status=ready`. The frontend polls `GET /sources/{id}` until `ready` (or `error`). This avoids request timeouts on long videos / large PDFs.

## 6. Data Model (Supabase)

```sql
sessions(id uuid pk, created_at timestamptz)
sources(id uuid pk, session_id uuid, type text, title text,
        summary text, status text, error text, created_at timestamptz)
chunks(id uuid pk, session_id uuid, source_id uuid,
       content text, embedding vector(1536), metadata jsonb)
messages(id uuid pk, session_id uuid, role text, content text,
         citations jsonb, created_at timestamptz)
```

Plus a `match_chunks(query_embedding, session_id, match_count)` SQL function for session-scoped cosine similarity search. Session memory persists in the `messages` table. `session_id` is generated client-side and stored in `localStorage`.

## 7. Chat Flow

1. User asks question → backend saves user message.
2. Embed query → `match_chunks` top-k (k≈6), session-scoped.
3. **Out-of-scope guard:** if best similarity < threshold, stream a graceful decline ("not covered in your sources") instead of answering.
4. Otherwise build labeled context + recent message history → stream grounded answer via SSE (token-by-token).
5. Save assistant message + citations; return the set of sources used for the UI chips.

**Grounding guarantees:** system prompt forbids outside knowledge, requires citing from provided labels, and instructs graceful decline for out-of-scope questions. "Explain in simple terms" is handled naturally by the model within grounded context.

## 8. Streaming

FastAPI `StreamingResponse` with `text/event-stream` (SSE). Next.js consumes via `fetch` + `ReadableStream` reader, appending tokens to the live message bubble.

## 9. Frontend Structure

```
frontend/
  app/
    layout.tsx
    page.tsx                 # split layout: sources panel | chat
  components/
    Chat/        ChatWindow, MessageBubble, StreamingMessage, ChatInput
    Sources/     SourcePanel, SourceCard (badge + summary + status), AddSourceForm, UploadDropzone
    Quiz/        QuizMode
  lib/
    api.ts                   # fetch client + SSE stream parsing
    session.ts               # localStorage session id
    types.ts
```

Split-panel UI: left = sources (add via URL or file upload, badges with type + status + summary); right = chat with streaming answers and per-answer source chips. A mode toggle switches between Chat and Quiz.

## 10. Bonus Features (all three)

1. **Multi-source attribution** — inherent in §4; rendered as source chips per answer.
2. **Quiz me mode** — `POST /quiz` retrieves a spread of chunks across sources and generates grounded questions (with answers); UI toggle renders them.
3. **Per-source summary** — generated at the end of ingestion, stored on `sources.summary`, shown on each source card.

## 11. Error & Edge States

| Case | Handling |
|------|----------|
| YouTube has no transcript | Source marked `error` with clear message |
| Scanned/empty PDF (no extractable text) | Detect empty extraction → `error`; OCR is out of scope (documented) |
| Webpage blocked / empty scrape | `error` with message |
| Oversized / unsupported file | Rejected at upload with validation message |
| OpenAI API failure | Graceful error surfaced to UI |
| Out-of-scope question | Similarity-guarded graceful decline |

## 12. Testing

TDD on pure logic: `chunker` (boundaries, overlap), each parser against small fixtures, `retriever` ranking + out-of-scope guard, citation label formatting. OpenAI calls mocked in tests. Frontend kept thin (manual + demo-driven verification). A full manual answer-quality pass is planned post-build.

## 13. Out of Scope / Documented Limitations

- OCR for scanned/image-only PDFs.
- Whisper-based audio transcription fallback when a YouTube transcript is unavailable.
- Authentication / multi-user accounts (session is anonymous, browser-scoped).
- Deployment (local-only for this iteration).

## 14. Evaluation Alignment

- **AI Quality (30%):** RAG retrieval, strict grounding, out-of-scope guard, citations.
- **Code Quality (25%):** uniform parser abstraction, modular RAG layer, typed schemas.
- **UI/UX (20%):** split panel, streaming, source badges, loading/error states.
- **Architecture (15%):** clean FE/BE split, env config, pgvector, async ingestion.
- **Bonus (10%):** all three bonus features.
