#!/usr/bin/env bash
# Start the FastAPI backend with the local virtualenv.
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  ./.venv/bin/python -m pip install --upgrade pip
  ./.venv/bin/python -m pip install -r requirements.txt
fi
exec ./.venv/bin/python -m uvicorn app.main:app --reload --port 8000
