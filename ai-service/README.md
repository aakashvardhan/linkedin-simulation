# AI Agent Service

A FastAPI-based agentic AI microservice for the LinkedIn simulation project. Acts as a recruiter copilot that orchestrates multi-step AI workflows via Kafka.

## What it does

- Parses candidate resumes using an LLM (via OpenRouter)
- Computes job-candidate match scores using sentence embeddings
- Generates recruiter outreach drafts with human-in-the-loop approval
- Streams real-time workflow updates to the UI via WebSocket
- Coordinates all steps asynchronously through Kafka

## Tech Stack

- **FastAPI** — REST API + WebSocket endpoints
- **Kafka** — async event-driven orchestration
- **OpenRouter** — LLM inference (Google Gemma)
- **Sentence Transformers** — semantic similarity for job matching
- **MongoDB** — agent traces and step results
- **Redis** — task state caching
- **Docker** — containerized deployment

## Project Structure

```
ai-service/
├── app/
│   ├── main.py               # FastAPI entry point
│   ├── config.py             # Settings and env vars
│   ├── agents/
│   │   ├── supervisor.py     # Orchestrates the hiring workflow
│   │   ├── resume_parser.py  # LLM-based resume parsing
│   │   ├── job_matcher.py    # Embedding-based match scoring
│   │   └── outreach_drafter.py # Outreach message generation
│   ├── api/
│   │   ├── routes.py         # REST endpoints
│   │   └── websocket.py      # WebSocket handler
│   ├── kafka/
│   │   ├── producer.py       # Publishes to ai.requests
│   │   └── consumer.py       # Consumes from ai.requests
│   └── models/
│       └── events.py         # Kafka event envelope schema
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/agent/request` | Submit a hiring workflow task |
| `POST` | `/agent/approve/{trace_id}` | Approve, edit, or reject outreach draft |
| `GET` | `/agent/status/{trace_id}` | Get task status |
| `WS` | `/ws/{trace_id}` | Real-time workflow updates |

## Kafka Topics

| Topic | Description |
|-------|-------------|
| `ai.requests` | Incoming AI task requests |
| `ai.results` | Completed step results and approvals |

## Setup

### Prerequisites
- Docker and Docker Compose
- An LLM API key:
  - OpenRouter (recommended) — get one at [openrouter.ai](https://openrouter.ai)
  - or Groq — get one at [groq.com](https://groq.com)

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

### Run locally
```bash
docker compose up -d
```

API docs available at `http://localhost:8000/docs`

## Workflow

1. Recruiter selects a job posting and candidate resume
2. UI sends `POST /agent/request`
3. Service publishes task to `ai.requests` Kafka topic
4. Supervisor consumes the task and runs:
   - Resume Parser → extracts skills, experience, education
   - Job Matcher → computes semantic match score
   - Outreach Drafter → generates personalized message
5. Results stream to UI via WebSocket in real time
6. Recruiter reviews and approves, edits, or rejects the draft
