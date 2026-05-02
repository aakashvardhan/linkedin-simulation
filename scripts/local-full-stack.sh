#!/usr/bin/env bash
# Start MySQL + Mongo (and dependencies) for the M3/M4 core backend, then run FastAPI on :8000.
# From repo root:  chmod +x scripts/local-full-stack.sh  &&  ./scripts/local-full-stack.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Desktop, then re-run."
  exit 1
fi

echo "==> docker compose up (MySQL, Mongo, Redis, Kafka, backend on :8000)"
docker compose up -d --build

echo "==> API: http://127.0.0.1:8000/docs"
echo "==> Seed sample users (optional):  cd backend && source .venv/bin/activate && python scripts/seed_sample_data.py"
echo "==> Frontend:  cd \"$ROOT/frontend\" && cp -n .env.example .env 2>/dev/null; npm run dev"
echo "    Seeded logins (after seed): see backend/README.md"
