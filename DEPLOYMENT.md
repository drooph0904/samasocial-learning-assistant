# Deployment Guide

Three pieces: **Supabase** (already cloud) · **Render** (FastAPI backend, holds the secrets) · **Vercel** (Next.js frontend).

> The OpenAI key lives **only on the backend (Render)** — never on Vercel.

---

## 0. Prerequisites
- The repo is on GitHub (public): `drooph0904/samasocial-learning-assistant`
- Supabase project with the schema from `backend/sql/schema.sql` already run
- An OpenAI API key — **set a spend limit** first: platform.openai.com → Settings → Limits → set a low monthly hard cap (e.g. $5–10)

---

## 1. Backend → Render (do this first; the frontend needs its URL)

1. Go to [render.com](https://render.com) → **New → Blueprint**.
2. Connect the GitHub repo. Render reads `render.yaml` and proposes the **samasocial-backend** web service.
3. Click **Apply**. When prompted, fill the secret env vars:
   - `OPENAI_API_KEY` = your key
   - `SUPABASE_URL` = your project URL
   - `SUPABASE_SERVICE_KEY` = your service_role / secret key
   - `CORS_ORIGINS` = leave as `http://localhost:3000` for now (update in step 3)
4. Wait for the build + deploy. You'll get a URL like `https://samasocial-backend.onrender.com`.
5. Verify: open `https://samasocial-backend.onrender.com/health` → `{"status":"ok"}`.

> **Free tier note:** the service sleeps after ~15 min idle; the first request then takes ~30–60s to wake. Fine for a demo.

---

## 2. Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
2. **Root Directory:** `frontend` (important — set this in the import screen).
3. Framework preset: **Next.js** (auto-detected). Leave build settings default.
4. **Environment Variable:**
   - `NEXT_PUBLIC_API_BASE` = your Render URL (e.g. `https://samasocial-backend.onrender.com`)
5. **Deploy.** You'll get a URL like `https://samasocial-learning-assistant.vercel.app`.

---

## 3. Wire CORS (connect the two)

1. Back in Render → the backend service → **Environment** → set
   `CORS_ORIGINS = https://your-app.vercel.app` (your real Vercel URL, no trailing slash).
2. Save → Render redeploys. Done.

Open the Vercel URL — it should talk to the backend and work end-to-end.

---

## Known production risks
- **YouTube transcripts from cloud IPs:** YouTube often blocks datacenter IPs (Render/AWS) for transcript fetching, so YouTube ingestion may fail in production even though it works locally. PDF/PPTX/webpage are unaffected. Fixes if needed: route transcript requests through a residential proxy, or add a Whisper audio-download fallback. Documented as a limitation.
- **Cold starts** on Render free tier (first request after idle is slow).
- **Cost:** all OpenAI usage is on your key — keep the spend cap on.

---

## Quick reference — env vars by host
| Host | Variable | Value |
|------|----------|-------|
| Render (backend) | `OPENAI_API_KEY` | your key (secret) |
| Render | `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | from Supabase |
| Render | `CORS_ORIGINS` | your Vercel URL |
| Vercel (frontend) | `NEXT_PUBLIC_API_BASE` | your Render URL |
