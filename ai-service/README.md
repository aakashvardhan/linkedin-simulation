# AI Agent Service

A FastAPI-based agentic AI microservice for the LinkedIn simulation project. Acts as a recruiter copilot that orchestrates multi-step AI workflows via Kafka.

## What it does

- Parses candidate resumes using an LLM (OpenRouter or Groq)
- Scores each candidate against a job using sentence embeddings plus skills overlap
- Explains match ranking in natural language (transparency for recruiters)
- Generates technical and behavioral interview questions from skill gaps
- Drafts personalized outreach with human-in-the-loop approval
- Supports **batch** workflows (many candidates per job) with a single ranked list
- Streams real-time workflow updates to the UI via WebSocket
- Persists traces and steps in MongoDB; caches status in Redis

## Tech Stack

- **FastAPI** — REST API + WebSocket endpoints
- **Kafka** — async event-driven orchestration
- **OpenRouter or Groq** — LLM inference for parsing, explanations, questions, and outreach
- **Sentence Transformers** — semantic similarity for job matching
- **MongoDB** — agent traces and per-step results
- **Redis** — task status cache and consumer idempotency
- **Docker Compose** — API gateway plus one container per skill service

## Project Structure

```
ai-service/
├── app/
│   ├── main.py                 # FastAPI entry point; starts Kafka consumer loop
│   ├── config.py               # Settings and env vars (LLM + skill service URLs)
│   ├── metrics.py              # Match quality / approval metrics
│   ├── agents/
│   │   ├── supervisor.py       # Orchestrates the hiring workflow
│   │   ├── resume_parser.py    # LLM resume → structured fields
│   │   ├── job_matcher.py      # Embedding + overlap scoring (matcher skill)
│   │   ├── ranking_explainer.py
│   │   ├── interview_question_generator.py
│   │   └── outreach_drafter.py
│   ├── skill_services/         # Standalone FastAPI apps (one per Docker service)
│   │   ├── resume_parser_service.py
│   │   ├── matcher_service.py
│   │   ├── ranking_explainer_service.py
│   │   ├── interview_questions_service.py
│   │   └── outreach_drafter_service.py
│   ├── api/
│   │   ├── routes.py           # REST endpoints under /agent
│   │   └── websocket.py        # WebSocket /ws/{trace_id}
│   ├── db/
│   │   ├── mongo.py            # Traces, steps, approvals; get_latest_result shaping
│   │   └── redis_client.py
│   ├── kafka/
│   │   ├── producer.py
│   │   ├── consumer.py         # ai.requests + ai.results
│   │   └── schemas.py
│   ├── models/
│   │   └── events.py
│   └── tools/
│       └── e2e_smoke.py        # In-container end-to-end checks
├── tools/
│   └── e2e_extended_host.py    # Host script: e2e + matcher failure injection
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/agent/request` | Queue a hiring workflow (single `resume_text` or batch `candidates`) |
| `GET` | `/agent/status/{trace_id}` | Cached + persisted status |
| `GET` | `/agent/result/{trace_id}` | Latest trace, slimmed steps, ranked list when complete |
| `POST` | `/agent/approve/{trace_id}` | Approve, edit, or reject outreach (`candidate_id` required for multi-candidate traces) |
| `GET` | `/agent/metrics/match-quality` | Match quality summary (optional query params) |
| `GET` | `/agent/metrics/approval-rate` | Approval action summary |
| `WS` | `/ws/{trace_id}` | Real-time pushes when the supervisor or approval handler updates state |

OpenAPI: `http://localhost:8000/docs`

## Result payload notes (`GET /agent/result/{trace_id}`)

- **`steps`**: Chronological pipeline steps (slimmed for size; full parsed resume and LLM blobs remain where needed for auditing).
- **While `trace.status` is `in_progress`**: you may see **`ranked_candidates_preview`** and **`stats_preview`** derived from completed `match_scored` steps so the UI can show a partial leaderboard.
- **When complete (`awaiting_approval` and beyond`)**: **`ranked_candidates`** (sorted by score), **`ranked_count`**, **`stats`**, and **`summary`**. Each ranked row includes outreach draft metadata; when the API is built from current sources, rows can also surface **`ranking_explanation`** and **`interview_questions`** without re-parsing `steps`.

Interview questions and ranking explanations are generated **per candidate** who successfully completes matching (skipped if resume parse or match fails for that row).

## Kafka Topics

| Topic | Description |
|-------|-------------|
| `ai.requests` | Incoming AI task requests (`ai.requested`) |
| `ai.results` | Workflow completion (`ai.completed`) and approval events (`ai.approval.recorded`) |

## Setup

### Prerequisites

- Docker and Docker Compose
- An LLM API key:
  - **OpenRouter** (recommended) — [openrouter.ai](https://openrouter.ai)
  - or **Groq** — [groq.com](https://groq.com)

### Environment variables

Create a `.env` file in the `ai-service/` directory:

```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=google/gemma-4-31b-it:free
# (optional alternative)
GROQ_API_KEY=...
GROQ_MODEL=llama-3.1-8b-instant
KAFKA_BOOTSTRAP=ai_kafka:9092
MONGO_URI=mongodb://ai_mongo:27017
REDIS_URL=redis://ai_redis:6379
```

Docker Compose injects skill service URLs (`RESUME_PARSER_URL`, `MATCHER_URL`, `RANKING_EXPLAINER_URL`, `INTERVIEW_QUESTIONS_URL`, `OUTREACH_DRAFTER_URL`) for the `ai-service` container; override only if you run pieces outside Compose.

### Run locally

```bash
docker compose up -d
```

First startup can take extra time while the **matcher** container downloads/loads the embedding model.

## Workflow

1. Recruiter selects a job and one or more candidates (each with `resume_text` and optional `candidate_id`).
2. Client calls `POST /agent/request` with `actor_id`, `job`, and either `resume_text` or `candidates[]`.
3. The API enqueues work on Kafka (`ai.requests`); the consumer runs **`run_hiring_workflow`** for that `trace_id`.
4. **Per candidate** (successful path):
   - Resume parser → structured skills, title, experience, education
   - Matcher → score, semantic score, overlap
   - Ranking explainer → bullet-style why the score makes sense
   - Interview question generator → skill gaps, technical + behavioral questions
   - Outreach drafter → personalized draft (pending approval)
5. Supervisor sorts successful candidates, writes the **`candidates_ranked`** step, sets status to **`awaiting_approval`**.
6. Optional: client opens **`WS /ws/{trace_id}`** to receive pushes as steps complete.
7. For each ranked candidate, recruiter calls **`POST /agent/approve/{trace_id}`** until all required approvals are recorded; consumer updates final trace status (`approved` / `edited` / `rejected`).

## Testing

**In-container smoke test** (recommended after `docker compose up`):

```bash
docker exec ai_service python -m app.tools.e2e_smoke
```

**Host script** (runs smoke inside Docker, then stops `matcher` briefly to verify failure handling):

```bash
python tools/e2e_extended_host.py
```

**Unit tests** (from `ai-service/`; disable broken global pytest plugins if needed):

```powershell
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = "1"
python -m pytest tests/ -v
```
