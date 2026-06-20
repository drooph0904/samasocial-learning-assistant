# Design — Challenge 1: RAG Chatbot

> Adapting the existing `samasocial-learning-assistant` repo to satisfy the
> AI/ML Challenge 1 (RAG Chatbot) brief. Document follows the assignment's own
> structure. Date: 2026-06-20.

## Objective

A Retrieval-Augmented Generation chatbot answering queries from a private corpus
of **≥10 Computer-Science / ML PDFs (each ≥200 pages)** using a
**free/open-source embedding model** (`BAAI/bge-base-en-v1.5`) and a
**free/open-source vector DB** (Postgres + pgvector, run locally), with
**end-to-end latency 2–5s**.

Generation uses hosted `gpt-4o-mini` — the brief explicitly permits a hosted LLM
for the answering step; the embedding model and vector DB remain open-source, so
all hard rules are met. The system is built by **adapting the existing FastAPI +
Next.js app**, reusing its chunking, metadata, citation, and streaming layers.

## Input sources / Dataset

- ~10 public-domain **Computer-Science / ML** PDFs, each ≥200 pages, fetched by a
  reproducible script (`scripts/ingest_corpus.py`).
- Mix of **native-text** PDFs and **2–3 deliberately scanned** PDFs so the OCR
  path is genuinely exercised.
- Supports: native text extraction (PyMuPDF) **and** OCR for scanned
  pages / embedded images (Tesseract).

## Core AI Tasks

### 1. Ingestion & Preprocessing — `app/ingestion/pdf.py`
PyMuPDF native extraction per page. If a page yields empty/near-empty text,
rasterize it (~200 dpi) and OCR with Tesseract. Clean & normalize text, strip
repeated headers/footers (heuristic over repeated first/last lines), detect
language (`langdetect`). Tag each segment with `extraction: native|ocr` + `lang`.
One-time precompute, so OCR cost on the M1 is acceptable.

### 2. Chunking & Metadata — `app/ingestion/chunker.py`
Token chunking at **600 tokens, 15% overlap** (within the 500–1000 token /
10–30% overlap rule; better for dense technical text). Per-chunk metadata:
`pdf_id, filename, page, extraction, lang`. Bbox is optional and **skipped in
v1** (page-level citation is sufficient; easy to add later).

### 3. Embedding — `app/rag/embeddings.py`
**`BAAI/bge-base-en-v1.5`** (768-d) via local `sentence-transformers` (MPS on
M1). BGE retrieval-instruction prefix applied to queries; passages embedded
plain. Embeddings **persisted** to the vector DB (precomputed, deterministic).

### 4. Indexing & Retrieval — `backend/sql/schema.sql`, `app/repository.py`, `app/rag/retriever.py`
pgvector **HNSW** index (`vector_cosine_ops`); schema column `vector(768)`. The
`match_chunks` RPC returns **top-K candidate chunks with metadata + similarity
scores**. Connection points at a local Docker Postgres+pgvector instance.

### 5. Reranking / Filtering — `app/rag/reranker.py` (new)
Retrieve top-20 via HNSW → **`BAAI/bge-reranker-base`** cross-encoder → keep
top-6. Plus the existing min-score filter for out-of-scope decline. Toggleable
via config; **default on** (improves the graded MRR / R@k metrics).

### 6. Generation / Answering (RAG) — `app/rag/generator.py`
`gpt-4o-mini` streams an answer conditioned strictly on retrieved chunks, with
**provenance (PDF filename + page)** rendered via the existing
`app/rag/citations.py`. Grounding/safety prompt; declines when nothing relevant
is retrieved.

### 7. Latency & Throughput
Per-query budget: query-embed ~20ms · HNSW search ~15ms · rerank ~200ms ·
LLM ~1.5–3s · overhead ~100ms → **~2–3.5s total**; first token <1s via
streaming. Runs locally on the M1 (no cloud cold start).

### 8. Evaluation & Monitoring — `backend/eval/`
A gold set (~25 Q&A with known source pages) + `eval/run_eval.py` reporting:
**latency p50/p95, Recall@k, MRR, citation accuracy** (does the cited page
actually contain the answer), and **hallucination rate** (gpt-4o-mini
LLM-judge: is the answer grounded in retrieved context?). Outputs a markdown
report.

## Non-functional requirements
- **Open / Free:** embedding model (BGE) + vector DB (pgvector) are open-source. ✅
- **Scalability:** batch ingestion of many ≥200-page PDFs; persisted embeddings.
- **Latency:** 2–5s on local M1 hardware. ✅
- **Explainability:** every answer cites PDF name + page. ✅
- **Reproducibility:** scripted corpus download, precomputed embeddings,
  deterministic chunking rules.

## Deliverable
A live **local** demo where:
- the corpus is ingested into pgvector via open-source embeddings;
- a user asks questions through the existing chat UI / API;
- the RAG pipeline retrieves the most relevant content in real time;
- answers arrive within 2–5s with **PDF name + page** citations.

The demo also shows: the **ingestion pipeline** (PDF → chunk → embed → DB), a
**Retrieval Inspector** panel (top-K chunks with similarity + rerank scores,
filename, page), and the **final cited answer**.

## Output
Real-time question answering from a large CS/ML PDF knowledge base — fast
responses, traceable sources, fully open-source retrieval stack.

---

## Appendix A — Changes by file (adaptation map)

| File | Change |
|------|--------|
| `backend/requirements.txt` | + `sentence-transformers`, `torch`, `pytesseract`, `Pillow`, `langdetect`; embeddings no longer call OpenAI |
| `backend/.env.example` | local Postgres DSN; `EMBED_MODEL`, `RERANKER_MODEL`, `RERANK_ENABLED`, `CORPUS_SESSION_ID` |
| `app/rag/embeddings.py` | replace OpenAI calls with local BGE via sentence-transformers |
| `app/rag/reranker.py` | **new** — bge-reranker-base cross-encoder |
| `app/rag/retriever.py` | retrieve top-20, call reranker, keep top-6 |
| `app/ingestion/pdf.py` | add Tesseract OCR fallback, header/footer strip, lang detect, `extraction` tag |
| `app/ingestion/chunker.py` | 600 tokens / 15% overlap; carry new metadata |
| `backend/sql/schema.sql` | `vector(1536)→vector(768)`, `ivfflat→hnsw`, update `match_chunks` |
| `app/repository.py` | DSN/connection to local pgvector; dimension update |
| `app/config.py` | new settings (embed/reranker models, corpus id, DSN) |
| `scripts/ingest_corpus.py` | **new** — download ~10 CS/ML PDFs, ingest into corpus |
| `backend/eval/` | **new** — gold set + `run_eval.py` + report |
| `frontend/` | **new** Retrieval Inspector panel (top-K + scores) |
| `docker-compose.yml` | **new** — local Postgres+pgvector service |

## Appendix B — Resolved decisions
- Reranker: **default on** (`bge-reranker-base`).
- Chunk size: **600 tokens / 15% overlap**.
- Bbox metadata: **skipped in v1**.
- Generation LLM: **hosted `gpt-4o-mini`** (allowed; reuses existing key).
- Vector DB: **local Postgres+pgvector via Docker** (reuses existing data layer;
  Qdrant is the alternative if a dedicated vector DB is ever wanted).
- Corpus scoping: a fixed `CORPUS_SESSION_ID` holds the persistent knowledge base.
- Existing extra features (YouTube/PPTX/webpage/quiz/voice) are left intact; the
  demo focuses on the PDF RAG path.
