# Candidate AI Assistant + CI Pipeline — Claude Code Plan
## Owner: Aakash
## Branch: `feature/candidate-ai-service` (off `main`)
---
## Shared Contracts (coordinate with Recruiter AI partner)
- Kafka topics: `ai.requests`, `ai.results` — shared JSON envelope (see `ai-service/app/models/events.py::KafkaEnvelope`)
- FastAPI service: single app at `ai-service/app/main.py`
  - Container port: **8000** (docker-compose), exposed via host-level mapping to 8007 when deployed alongside the other domain services
- Adopted layout (differs from earlier draft — matches what partner shipped on `feature/recruiter-ai-service`):
  - `ai-service/app/api/candidate_routes.py` — candidate-facing `/ai/*` endpoints (this branch)
  - `ai-service/app/api/routes.py` — recruiter-facing `/agent/*` endpoints (partner)
  - `ai-service/app/api/websocket.py` — shared WebSocket hub (`/ws/{trace_id}` and `/ai/ws/{task_id}`)
  - `ai-service/app/agents/` — resume_parser, job_matcher, outreach_drafter, supervisor, career_coach (shared)
  - `ai-service/app/kafka/` — producer, consumer, schemas (shared)
  - `ai-service/app/db/` — mongo client, task_store (shared)
  - `ai-service/app/clients/` — HTTP clients for Profile/Job/Messaging services (shared)
- LLM provider: **Groq** via OpenAI-compatible API (`llama-3.1-8b-instant`); key loaded from `GROQ_API_KEY` env var — placeholder in `.env.example`.
- MongoDB collection: `ai_tasks` for task traces (idempotency keyed on `task_id`)

---

## Part 1: CI Pipeline

### 1.1 GitHub Actions workflow
- [ ] Create `.github/workflows/ci.yml`
- [ ] Trigger on: push to `main`/`develop`, all PRs
- [ ] Steps: checkout → install deps → lint (ruff/flake8) → unit tests (pytest) → build Docker images
- [ ] Fail-fast on lint or test failure

### 1.2 Docker build
- [ ] Create `Dockerfile` per service (or multi-stage if monorepo)
- [ ] Create `docker-compose.yml` for local dev (all 7 services + Kafka + Zookeeper + MySQL + MongoDB + Redis)
- [ ] CI step: `docker compose build` to verify images build cleanly

### 1.3 Integration smoke tests
- [ ] CI step: `docker compose up -d` → wait for health checks → run smoke test script against key endpoints
- [ ] Smoke tests: hit `/members/create`, `/jobs/search`, `/ai/parse-resume` with test payloads, assert 2xx

### 1.4 Branch protection
- [ ] Require passing CI before merge to `main`
- [ ] Require at least 1 review

### 1.5 Secrets & env config
- [ ] Add GitHub secrets: DB creds, Kafka broker, any API keys (OpenAI/HF for AI service)
- [ ] `.env.example` checked into repo with placeholder values

### 1.6 Deployment step (W6)
- [ ] Push Docker images to ECR/DockerHub on merge to `main`
- [ ] Trigger AWS deploy (ECS/EKS) or document manual deploy steps

---

## Part 2: Candidate AI Assistant (FastAPI — service port 8000 in container)
### 2.1 Project scaffolding
- [x] FastAPI app in `ai-service/app/main.py` (imported from partner, amended)
- [x] Router: `ai-service/app/api/candidate_routes.py` mounted at `/ai`
- [x] Models/schemas in `ai-service/app/models/` (`task.py`, `events.py`)
- [x] MongoDB connection helper in `ai-service/app/db/mongo.py` (Motor-backed)
- [x] Kafka producer/consumer wrappers in `ai-service/app/kafka/`
- [x] WebSocket manager in `ai-service/app/api/websocket.py`
- [x] Task persistence layer in `ai-service/app/db/task_store.py` (MongoDB `ai_tasks` collection)
- [x] External-service HTTP clients in `ai-service/app/clients/`

### 2.2 Resume Parser Skill — `POST /ai/parse-resume`
- [ ] Accept `member_id`, `resume_url`, `resume_text`
- [ ] Parse structured fields: skills, years_experience, education, experience, location
- [ ] Use LLM (OpenAI/HF) or rule-based extraction
- [ ] Return parsed data + `confidence_score`
- [ ] Handle 401, 404 errors per API doc

### 2.3 Job–Candidate Matching Skill — `POST /ai/match-candidates`
- [ ] Accept `job_id`, `top_k`, optional `filters` (min_experience_years, required_skills)
- [ ] Fetch job details from Job Service (internal HTTP call to port 8002)
- [ ] Fetch candidate pool from Profile Service (port 8001)
- [ ] Score candidates: skills overlap (weight 0.4) + experience (0.3) + location (0.2) + embedding similarity (0.1)
- [ ] Return ranked list with `match_score`, `skills_overlap`, `skills_missing`
- [ ] Handle 401, 403 (recruiter-only), 404

### 2.4 Outreach Draft Generator — `POST /ai/outreach-draft`
- [ ] Accept `job_id`, `member_id`, `recruiter_id`, `tone`
- [ ] Generate personalized outreach message using LLM
- [ ] Return `draft_message` + `generated_at`
- [ ] Handle 401, 403, 404

### 2.5 Hiring Assistant (Supervisor Agent) — `POST /ai/hiring-assistant`
- [ ] Accept `job_id`, `recruiter_id`, `top_k`, `generate_outreach`
- [ ] Create task record in MongoDB with `task_id`, `trace_id`, status=`processing`
- [ ] Publish task to `ai.requests` Kafka topic
- [ ] Return 202 with `task_id`, `trace_id`, `websocket_url`
- [ ] Handle 401, 403, 404

### 2.6 Kafka consumer — Hiring Assistant Agent
- [ ] Consume from `ai.requests` topic
- [ ] Idempotent processing: check `idempotency_key` against MongoDB before executing
- [ ] Orchestrate multi-step pipeline:
  1. Call Resume Parser for all candidates
  2. Call Job–Candidate Matching
  3. If `generate_outreach=true`, call Outreach Draft for top-k
- [ ] Maintain `trace_id` across all steps
- [ ] Update task status in MongoDB at each step
- [ ] Push progress via WebSocket at each step transition
- [ ] Publish final results to `ai.results` topic

### 2.7 Task Status — `GET /ai/task/{task_id}`
- [ ] Read task from MongoDB
- [ ] Return current step, steps_completed, steps_remaining, progress_percent
- [ ] If completed: include full results (shortlisted candidates + outreach drafts)
- [ ] Handle 404

### 2.8 Human-in-the-Loop — `POST /ai/approve-outreach`
- [ ] Accept `task_id`, `recruiter_id`, `candidate_id`, `action` (approved/edited/rejected), `final_message`
- [ ] Validate action enum
- [ ] If approved/edited: send message via Messaging Service (`POST /messages/send` on port 8005)
- [ ] Log approval decision in MongoDB task trace
- [ ] Publish approval event to `ai.results`
- [ ] Handle 400, 401, 403, 404

### 2.9 WebSocket — `ws /ai/ws/{task_id}`
- [ ] On connect: validate task_id exists
- [ ] Push JSON messages at each step: `{step, status, message, progress}`
- [ ] Final message: `{step: "done", status: "awaiting_approval", progress: 100}`
- [ ] Handle disconnect gracefully

### 2.10 Career Coach (Optional) — `POST /ai/career-coach`
- [ ] Accept `member_id`, `target_job_id`
- [ ] Compute gap analysis: missing skills, match score delta
- [ ] Generate headline suggestion, skill recommendations, resume tips via LLM
- [ ] Return suggestions object
- [ ] Handle 401, 404

---

## Part 3: Evaluation Metrics

- [ ] Matching quality: compute top-k skills overlap percentage, log per task
- [ ] Human-in-the-loop: track approved/edited/rejected counts per recruiter, report approval rate
- [ ] Store metrics in MongoDB `ai_metrics` collection
- [ ] Expose via analytics endpoint or include in task results

---

## Part 4: Testing

- [ ] Unit tests for resume parser (mock LLM, test field extraction)
- [ ] Unit tests for matching scorer (known inputs → expected ranking)
- [ ] Integration test: hiring-assistant end-to-end (mock Kafka or use testcontainers)
- [ ] Test idempotency: submit same `idempotency_key` twice, verify no duplicate processing
- [ ] Test failure modes: job not found, unauthorized, invalid status transition on approve

---

## Execution Order

| Week | Focus |
|------|-------|
| W3 | Scaffolding (2.1), Resume Parser (2.2), Match Candidates (2.3), CI basics (1.1, 1.2) |
| W4 | Kafka consumer (2.6), Hiring Assistant (2.5), WebSocket (2.9), CI integration tests (1.3) |
| W5 | Outreach Draft (2.4), Approve (2.8), Task Status (2.7), Metrics (Part 3), branch protection (1.4) |
| W6 | Career Coach (2.10), testing (Part 4), deployment step (1.6), stabilize |

---

## Replacement Notes (must address before production)
Tracks code that ships as a stub so the rest of the system can be built and tested, but MUST be replaced before real users or data are involved.

### R1. Bearer-token auth stub — `ai-service/app/api/auth.py`
- **What ships now:** `get_principal` requires an `Authorization: Bearer <token>` header but does **not** validate the token. Identity (`subject_id`) and role come from `X-User-Id` / `X-User-Role` headers set by the gateway. `require_recruiter` enforces role-based 403 on that unverified claim.
- **Why it's acceptable temporarily:** lets us write and test every 401/403 path, run end-to-end flows with `curl`/Postman, and keep the dependency shape (`Principal`, `get_principal`, `require_recruiter`) stable.
- **Risks if not replaced:**
  - No cryptographic proof of caller identity — any client can forge `X-User-Id`/`X-User-Role`.
  - Trivial role escalation (member → recruiter) by flipping a header.
  - Audit logs cannot be trusted (recorded actor_id is unverified).
  - No expiry/revocation/rotation — leaked tokens are valid forever (because they aren't checked at all).
- **Replacement trigger (must be done BEFORE any of these):**
  1. Before the first deployment to a shared environment (staging included).
  2. Before the AI service is reachable by anything other than the API gateway.
  3. Before real member/job data is loaded into MongoDB.
- **Replacement work:**
  - Decode and verify JWT via the Auth Service's JWKS (RS256, check `iss`, `aud`, `exp`).
  - Derive `subject_id` and `role` from verified claims only; stop reading `X-User-*` headers.
  - Add integration tests with signed + expired + tampered tokens.
  - Keep the same public surface (`Principal`, `get_principal`, `require_recruiter`) so route code is unchanged.

---

## Integration Changelog
Running log of what is already implemented on `feature/candidate-ai-service`, what is still stubbed/mocked, and what needs a follow-up during integration with the partner's recruiter branch or the rest of the platform. Update this section as items are completed or new TODOs appear.

### Implemented
- Imported partner scaffolding from `feature/recruiter-ai-service` at commit snapshot (24 files): FastAPI entry point, `/agent/*` recruiter routes, websocket hub, Kafka producer/consumer, Groq-backed agents, docker-compose, Dockerfile, requirements.
- Amended `PLAN.md` for actual layout and endpoint surface.
- `app/config.py`: added `mongo_db_name`, downstream service base URLs (`profile_service_url`, `job_service_url`, `messaging_service_url`), `http_client_timeout`; switched to `SettingsConfigDict`.
- `app/models/task.py`: filled in `TaskStatus`, `StepStatus`, `StepName`, `ApprovalAction`, `StepResult`, `AgentTask` with progress helpers.
- `app/db/mongo.py`: real Motor client with cached `AsyncIOMotorClient`, `get_ai_tasks_collection`, `close_client`.
- `app/db/task_store.py`: CRUD + idempotency lookup (`get_task_by_idempotency_key`), `append_step`, `set_result`, `record_approval`, `mark_step_failed`.
- `app/kafka/schemas.py`: re-export of `KafkaEnvelope` + typed `AIEventType` / `AIEntityType` / topic constants.
- `app/clients/`: `profile_client`, `job_client`, `messaging_client`, shared `errors.py` with `ServiceError` + `translate_service_error`.
- `.env.example` with placeholders (no real secrets).

### In Progress / Next Up
- `app/api/auth.py` — bearer-token stub (see R1 above).
- `app/api/candidate_routes.py` — all `/ai/*` endpoints (2.2–2.10).
- `app/agents/career_coach.py` — optional 2.10 skill.
- `app/kafka/consumer.py` — wire idempotency check + per-step Mongo persistence + WebSocket pushes (2.6).

### Known Stubs / Mocks To Replace During Integration
- **Auth (R1):** bearer-token stub, see above.
- **LLM calls (resume_parser / outreach_drafter / career_coach):** require `GROQ_API_KEY`. Until the key is set, endpoints that hit the LLM will fail at runtime. Tests will mock the Groq client; integration environment must have the key configured before smoke tests run.
- **Downstream services:** `profile_client` / `job_client` / `messaging_client` assume paths `/members/{id}`, `/members/candidates`, `/jobs/{id}`, `/messages/send` — confirm and adjust once the partner teams publish their OpenAPI specs.
- **`app/api/routes.py` `_task_results` dict:** partner's in-memory store is used by `GET /agent/result/{trace_id}`. Our new Mongo-backed `task_store` does not replace it yet; when the branches merge, migrate `/agent/result` to read from `task_store` and delete the dict.
- **Container port:** docker-compose exposes `8000`; PLAN.md originally said `8007`. Host-level mapping will redirect 8007 → 8000 until port is harmonized across services.
- **Redis:** partner included `redis_client.py` as a stub. Not used yet. Decide per-use-case (rate limiting? idempotency cache in front of Mongo?) before enabling.
- **Supervisor (`app/agents/supervisor.py`):** returns in-memory results only; does not yet persist step transitions via `task_store`. Being extended under 2.6.

### Post-Testing Follow-Ups
(Populate as tests surface issues. Examples of items likely to land here.)
- Confirm Mongo connection behavior under concurrent writes (find_one_and_update atomicity is assumed but not yet load-tested).
- Validate JSON parsing resilience of `parse_resume` when the LLM returns unexpected shapes; add retry with a stricter prompt if needed.
- Verify WebSocket backpressure — current implementation drops silent if send raises; confirm this is acceptable with the frontend team.
- Confirm `sentence-transformers` cold-start time in the container (first request can be slow because the model downloads on first encode).

### Integration-Time Follow-Ups (when merging with recruiter branch)
- Reconcile `main.py` startup/shutdown hooks if partner also adds DB close handlers.
- Deduplicate any model imports if partner later moves `KafkaEnvelope` out of `models/events.py`.
- Ensure only one Kafka consumer consumes `ai.requests` per `group_id` to avoid split-brain processing.
- Align shared `.env` schema if partner adds new env vars.
