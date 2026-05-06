#!/usr/bin/env bash
# Run GridFS resume seed (mongosh), then start the FastAPI backend from backend/.
# Usage (from anywhere): ./scripts/dev-backend-with-resumes.sh
# Env: SEED_MONGO_URI, RESUME_TARGET_COUNT, PORT, MYSQL_* (optional overrides)
#
# Defaults match repo-root docker-compose.yml (MySQL published on host :3307, root / linkedin_pass).
# For backend/docker-compose.yml only (MySQL on :3306, password root): MYSQL_PORT=3306 MYSQL_PASSWORD=root ./scripts/dev-backend-with-resumes.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

SEED_MONGO_URI="${SEED_MONGO_URI:-mongodb://127.0.0.1:27017/linkedin_simulation}"
RESUME_TARGET_COUNT="${RESUME_TARGET_COUNT:-10000}"
PORT="${PORT:-8000}"

export RESUME_TARGET_COUNT
mongosh "$SEED_MONGO_URI" scripts/seed/seed_resumes_gridfs.js

cd "$ROOT/backend"
# Exported vars override backend/.env (needed when .env targets Docker service names / wrong host port).
export MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
export MYSQL_PORT="${MYSQL_PORT:-3307}"
export MYSQL_PASSWORD="${MYSQL_PASSWORD:-linkedin_pass}"

if [[ -x "$ROOT/.venv/bin/python" ]]; then
  PY="$ROOT/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "python not found; activate .venv or install Python." >&2
  exit 1
fi
exec "$PY" -m uvicorn app.main:app --reload --port "$PORT"
