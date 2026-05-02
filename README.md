# linkedInDS — full stack (FastAPI + React)

Integrated SPA + core backend (MySQL). Anyone can run locally with Docker for databases + two terminals for API and UI.

## Prerequisites

- **Python 3.11+** (backend)
- **Node 18+** and npm (frontend)
- **Docker Desktop** (recommended: MySQL, MongoDB, Redis, Kafka via `backend/docker-compose.yml`)

## Quick start

### 1. Backend dependencies & env

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # edit MYSQL_* and JWT_SECRET
```

Start infrastructure (from `backend/`):

```bash
docker compose up -d mysql mongo redis
```

Optional one-shot (builds API container too — see script):

```bash
chmod +x scripts/local-full-stack.sh
./scripts/local-full-stack.sh   # from repo root
```

Run the API locally:

```bash
cd backend
source .venv/bin/activate
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Health: <http://127.0.0.1:8000/health>
- OpenAPI: <http://127.0.0.1:8000/docs>

### 2. Frontend

```bash
cd frontend
cp .env.example .env          # set VITE_API_BASE_URL=http://127.0.0.1:8000
npm install
npm run dev
```

Open the printed URL (often <http://localhost:5173>). After changing `.env`, restart Vite.

### 3. First account

Use **Create account** in the app (persists to MySQL when `VITE_BACKEND_INTEGRATION=true`), or run optional seed scripts — see `backend/README.md`.

## Configuration notes

- **CORS:** With empty `CORS_ORIGINS`, local dev allows `localhost` / `127.0.0.1` on any port (Vite may use 5174+). For production, set `CORS_ORIGINS` on the backend.
- **Integration contract:** `docs/INTEGRATION.md`

## Repo layout

| Path | Role |
|------|------|
| `backend/` | FastAPI, SQLAlchemy, JWT auth |
| `frontend/` | Vite + React SPA |
| `docs/` | Partner integration notes |
| `scripts/` | Helper scripts (e.g. local stack) |
