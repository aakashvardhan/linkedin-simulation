# LinkedIn Simulation + Agentic AI — Final Project Report

> **Course:** SJSU DATA 236 — Distributed Systems (Spring 2026)
> **Project Spec:** `Class_Project_Description_LinkedIn_AgenticAI.pdf`
> **Reference Branch:** `feature/full-stack-integration`


A 3-tier, distributed LinkedIn-style hiring platform with **Kafka-orchestrated** core domain services and a **multi-agent FastAPI Recruiter Copilot** that plans multi-step hiring workflows (resume parse → match → explain → questions → outreach → human approval).

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Repository Layout](#2-repository-layout)
3. [Architecture (3-Tier + Kafka)](#3-architecture-3-tier--kafka)
4. [Tier 3 — Database Schema & Justification](#4-tier-3--database-schema--justification)
5. [Tier 2 — Services & API Contract](#5-tier-2--services--api-contract)
6. [Kafka Topics, Envelope, and Idempotency](#6-kafka-topics-envelope-and-idempotency)
7. [Agentic AI Layer (Recruiter Assistant)](#7-agentic-ai-layer-recruiter-assistant)
8. [Tier 1 — Client (React SPA)](#8-tier-1--client-react-spa)
9. [Datasets & Seeding (10K-scale)](#9-datasets--seeding-10k-scale)
10. [Caching, Object Management, and Write Policy](#10-caching-object-management-and-write-policy)
11. [Failure Modes & Exception Handling](#11-failure-modes--exception-handling)
12. [Performance & Scalability Report](#12-performance--scalability-report)
13. [Analytics Dashboards (Required Graphs)](#13-analytics-dashboards-required-graphs)
14. [Local & Docker Deployment](#14-local--docker-deployment)
15. [Testing](#15-testing)
16. [Mapping to Grading Rubric](#16-mapping-to-grading-rubric)
17. [Observations & Lessons Learned](#17-observations--lessons-learned)

---

## 1. System Overview

| Concern | Implementation |
|---|---|
| **Tier 1 — Client** | React 19 + Vite SPA in `frontend/`, served by Nginx in production |
| **Tier 2 — Services** | FastAPI core API (`backend/`) + 3 Express microservices (`services/application-service`, `services/messaging-service`, `services/analytics-service`) + FastAPI Agentic AI orchestrator + 5 skill services (`services/recruiter-assistant`) |
| **Tier 2 — Messaging** | Apache Kafka (Confluent 7.6) with Zookeeper; 9 topics, JSON envelope, consumer-group fan-out, idempotency keys |
| **Tier 3 — Databases** | MySQL 8.0 (transactional core), MongoDB 7.0 (events, agent traces, GridFS resumes), Redis 7.2 (SQL cache + idempotency claims) |
| **Edge** | Nginx API gateway on `:8090` routes `/api/*` across all backends + WebSocket `/api/ws/*` for the AI service |
| **Deployment** | Single root `docker-compose.yml` orchestrates 17 containers across 5 logical pairs |

**Required user-journey flows (all implemented end-to-end):**

1. Member: register → search jobs → view detail → save → apply (Kafka `application.submitted` → analytics).
2. Recruiter: post a job → review applicants → update status (Kafka `application.statusChanged` → notifications).
3. Member ↔ Recruiter: connection request → accept (Kafka `connection.requested`); messaging thread (Kafka `message.sent`).
4. **Agentic AI:** recruiter selects a job + applicant batch → Hiring Assistant orchestrates Resume Parser → Matcher → Ranking Explainer → Interview Question Generator → Outreach Drafter → recruiter approves/edits/rejects per-candidate (human-in-the-loop).

---

## 2. Repository Layout

```text
linkedin-simulation/
├── backend/                       # FastAPI — Profile / Job / Connection / Application / Analytics
│   ├── app/
│   │   ├── api/routes/            # auth, members, jobs, connections, applications, analytics
│   │   ├── core/                  # config, redis, kafka publisher, security (JWT/bcrypt)
│   │   ├── db/                    # mysql.py (SQLAlchemy), mongo.py (PyMongo + indexes)
│   │   ├── models/                # SQLAlchemy ORM (Member, JobPosting, Application, …)
│   │   ├── schemas/               # Pydantic request/response models
│   │   └── main.py                # FastAPI app + CORS + health/ready
│   ├── consumer.py                # Standalone Kafka → MongoDB events sink
│   ├── schema.sql                 # MySQL DDL (members, jobs, applications, connections, …)
│   └── scripts/                   # seed_sample_data, seed_resumes_gridfs, ingest_demo_data, …
│
├── services/
│   ├── application-service/       # Express — applications + notifications, port 8004
│   ├── messaging-service/         # Express — threads + messages,         port 8005
│   ├── analytics-service/         # Express — events ingestion + dashboards, port 8006
│   └── recruiter-assistant/       # FastAPI agentic AI + 5 skill services, port 8000
│       └── app/{agents,api,db,kafka,skill_services,models,tools}/
│
├── frontend/                      # React 19 + Vite + Recharts SPA
│   ├── src/{api,pages,components,context,utils,data}/
│   ├── Dockerfile + nginx.conf    # Static build served by Nginx
│
├── nginx/nginx.api-gateway.conf   # Edge gateway — /api/{members,jobs,applications,analytics,agent,ws}
├── jmeter/                        # JMeter test plan (Scenario A read benchmark)
├── charts/                        # Generated PNGs for the perf section (B / B+S / B+S+K / +Other)
├── datasets/                      # Kaggle resume PDFs + seed SQL (10K members/jobs/apps)
├── scripts/                       # schema.sql, seed_analytics.py, local-full-stack.sh, …
├── docs/INTEGRATION.md            # Cross-team contract surface
├── docker-compose.yml             # Root orchestrator (17 services, 5 named volumes)
├── generate_chart.py              # Renders the 5 required performance bar charts
├── integration_test.py            # End-to-end smoke test across all services
└── TEAM_SETUP_GUIDE.md            # 15-minute team onboarding for the 10K dataset
```

---

## 3. Architecture (3-Tier + Kafka)

```text
                ┌────────────────────────────────────┐
                │          Tier 1 — Client           │
                │  React SPA (Vite) + Recharts       │
                │  served by Nginx on :3000          │
                └──────────────┬─────────────────────┘
                               │ HTTPS / JSON  (same-origin /api)
                               ▼
                ┌────────────────────────────────────┐
                │     Nginx API Gateway :8090        │
                │   /api/* → backend services        │
                │   /api/ws/* → recruiter-assistant  │
                └──┬──────┬──────┬──────┬──────┬─────┘
                   │      │      │      │      │
        ┌──────────┘      │      │      │      └──────────────────┐
        ▼                 ▼      ▼      ▼                         ▼
┌───────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────────────────┐
│ api-backend   │ │ application- │ │ messaging-   │ │ analytics-service (Node)  │
│ (FastAPI)     │ │ service      │ │ service      │ │   /events/ingest          │
│ /members      │ │   :8004      │ │   :8005      │ │   /analytics/jobs/top     │
│ /jobs         │ │              │ │              │ │   /analytics/funnel       │
│ /connections  │ │              │ │              │ │   /analytics/geo          │
│ /applications │ │              │ │              │ │   /analytics/{m,r}/dash   │
│ /analytics    │ │              │ │              │ │   :8006                   │
│ :8010 (host)  │ │              │ │              │ │                           │
└──────┬────────┘ └──────┬───────┘ └──────┬───────┘ └────────────┬──────────────┘
       │                 │                │                       │
       │                 │                │                       │
       └────── publish ──┴───── publish ──┴───── publish ─────────┤
                                  │                                │
                                  ▼                                │
                     ┌───────────────────────────┐                │
                     │       Apache Kafka         │ ◄── consumes ─┘
                     │   :9092 / :9093 (host)     │
                     │   topics: job.viewed,      │
                     │   job.saved,               │
                     │   application.submitted,   │
                     │   application.statusChanged│
                     │   message.sent,            │
                     │   connection.requested,    │
                     │   profile.viewed,          │
                     │   ai.requests, ai.results  │
                     └────┬───────────────┬───────┘
                          │               │
                          ▼               ▼
   ┌─────────────────────────────┐  ┌────────────────────────────────────────┐
   │ recruiter-assistant         │  │             Tier 3 — Data              │
   │ (FastAPI + WebSockets)      │  │ ┌─────────────┐ ┌─────────────────┐    │
   │ orchestrates skills:        │  │ │ MySQL 8.0   │ │ MongoDB 7.0     │    │
   │  - resume_parser  :8000     │  │ │ members     │ │ events          │    │
   │  - matcher        (embed)   │  │ │ jobs        │ │ agent_traces    │    │
   │  - ranking_explainer (LLM)  │  │ │ applications│ │ resumes (GridFS)│    │
   │  - interview_questions      │  │ │ connections │ │ approvals       │    │
   │  - outreach_drafter (LLM)   │  │ │ saved_jobs  │ │ metrics         │    │
   │ :8007 (host)                │  │ │ companies   │ └─────────────────┘    │
   │ WS /ws/{trace_id}           │  │ │ recruiters  │  ┌────────────────┐    │
   │ Kafka: ai.requests/results  │  │ └─────────────┘  │ Redis 7.2      │    │
   └─────────────────────────────┘  │                  │ SQL cache +    │    │
                                    │                  │ idempotency    │    │
                                    │                  └────────────────┘    │
                                    └────────────────────────────────────────┘
```

**Producer/consumer split (per spec §3.1):**
Each domain has an **API service that produces** (Profile, Job, Connection, Application, Messaging, AI orchestrator) and a **consumer that materializes** (analytics-service for the events ledger; recruiter-assistant for `ai.requests`; backend `consumer.py` as a fallback events sink). Kafka sits in the middle so producers never directly call consumers.

---

## 4. Tier 3 — Database Schema & Justification

### 4.1 Why split MySQL + MongoDB?

| Concern | Store | Why |
|---|---|---|
| Transactional records (`members`, `recruiters`, `companies`, `job_postings`, `applications`, `connections`, `saved_jobs`) | **MySQL 8.0 (InnoDB)** | Strong relational integrity (FKs, `UNIQUE` on email + `(job_id, member_id)` on applications/saved jobs), transactions for multi-row updates, mature query planner for the recruiter dashboard joins |
| Domain events stream (`events` collection) | **MongoDB 7.0** | Schemaless append-only log — every Kafka message lands here verbatim; flexible aggregation pipelines drive top-jobs/funnel/geo charts |
| Agent traces, per-step results, approvals, metrics | **MongoDB** | Variable per-step JSON shape (resume parse output, LLM output, candidate batch), needs per-trace fan-out and cheap appends |
| Resume PDFs (10K source files) | **MongoDB GridFS** | Binary storage with metadata; `resume_url = mongodb://resumes/member_XXXXXX` is referenced from the MySQL `members.resume_url` column |
| SQL caching + Kafka consumer idempotency claims | **Redis 7.2** | Sub-ms cache; `cache_delete_pattern` for write-invalidate; `claim_idempotency` SET NX for at-least-once-safe consumers |

### 4.2 MySQL DDL (excerpt — see `backend/schema.sql` and `scripts/schema.sql`)

```sql
CREATE TABLE members (
  member_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name, last_name, phone, location_city, location_state, location_country, headline, about,
  profile_photo_url, resume_url,           -- resume_url → mongodb://resumes/member_XXXXXX
  connections_count INT DEFAULT 0, profile_views INT DEFAULT 0,
  created_at, updated_at
);
CREATE TABLE member_skills      (skill_id PK, member_id FK, skill_name);
CREATE TABLE member_experience  (exp_id PK, member_id FK, company, title, start_date, end_date, description);
CREATE TABLE member_education   (edu_id PK, member_id FK, school, degree, field, start_year, end_year);

CREATE TABLE companies   (company_id PK, name, industry, size, logo_url, created_at);
CREATE TABLE recruiters  (recruiter_id PK, company_id FK, email UNIQUE, password_hash, role, …);

CREATE TABLE job_postings (
  job_id PK, company_id FK, recruiter_id FK,
  title, description, seniority_level, employment_type, location, work_mode,
  skills_required TEXT, salary_min, salary_max,
  status ENUM('open','closed') DEFAULT 'open',
  posted_datetime, views_count, applicants_count, saves_count, closed_at
);

CREATE TABLE applications (
  application_id PK, job_id FK, member_id FK,
  resume_url, cover_letter, status ENUM('submitted','reviewing','interview','offer','rejected'),
  application_datetime, recruiter_notes, updated_at,
  UNIQUE KEY ux_app (job_id, member_id)              -- prevents duplicate apply
);

CREATE TABLE connections (
  connection_id PK, requester_id, requester_type, receiver_id, receiver_type,
  status ENUM('pending','accepted','rejected'),
  requested_at, responded_at,
  UNIQUE KEY ux_conn (requester_id, receiver_id)
);

CREATE TABLE saved_jobs (
  save_id PK, job_id FK, member_id FK, saved_at,
  UNIQUE KEY ux_save (job_id, member_id)             -- idempotent save
);
```

**Compound indexes added for analytics & dashboard queries (M4):**

```sql
ALTER TABLE job_postings   ADD INDEX idx_jobs_analytics       (status, applicants_count, views_count, saves_count);
ALTER TABLE job_postings   ADD INDEX idx_jobs_recruiter_status(recruiter_id, status, posted_datetime);
ALTER TABLE applications   ADD INDEX idx_app_member_status    (member_id, status, application_datetime);
ALTER TABLE applications   ADD INDEX idx_app_job_status       (job_id, status, application_datetime);
ALTER TABLE members        ADD INDEX idx_members_location     (location_city, location_state);
ALTER TABLE connections    ADD INDEX idx_connections_status_date (status, requested_at);
ALTER TABLE saved_jobs     ADD INDEX idx_saved_jobs_date      (member_id, saved_at);
```

### 4.3 MongoDB collections & indexes

| Collection | Used by | Indexes (`backend/app/db/mongo.py`) |
|---|---|---|
| `events` | analytics-service consumer + backend `consumer.py` | `ux_event_idempotency` (unique on `idempotency_key`), `idx_event_type_time`, `idx_event_entity (entity_type, entity_id, timestamp DESC)`, `idx_event_actor` |
| `agent_traces` | recruiter-assistant | per-trace upsert, `trace_id` index |
| `agent_steps` | recruiter-assistant | by `trace_id` + `created_at` |
| `approvals` | recruiter-assistant | `(trace_id, candidate_id, created_at)` for distinct-candidate counts |
| `metrics` | recruiter-assistant | `metric_type + created_at` for the eval rollups |
| `resumes.files / .chunks` | GridFS resumes (10K) | `_id = member_XXXXXX`, `metadata.member_id` index |

---

## 5. Tier 2 — Services & API Contract

All endpoints are **POST + JSON** to mirror the spec; auth is **Bearer JWT** (HS256). Success envelope: `{"status":"success","data":{…}}`. Error envelope: `{"status":"error","error":{"code":N,"message":"…"}}`. Source of truth is the live OpenAPI at **`http://<host>:8010/docs`**.

### 5.1 Profile Service — `backend/app/api/routes/members.py` (FastAPI)

| Endpoint | Behaviour |
|---|---|
| `POST /members/create` | Bcrypt-hashes password, inserts member + skills/experience/education, returns JWT |
| `POST /members/login`  | Verifies password, returns JWT |
| `POST /members/get`    | Returns full profile **with embedded skills/experience/education**; increments `profile_views`; emits `profile.viewed` (minute-bucketed idempotency key prevents refresh inflation); cache-aside on `member:{id}` |
| `POST /members/update` | Field-level update with auth check; cache invalidation |
| `POST /members/delete` | JWT-gated soft auth + cascade |
| `POST /members/search` | Filters by keyword, skills, city, state with pagination |
| `POST /recruiters/{create,get,login,search}` | Symmetric for recruiter accounts |

### 5.2 Job Service — `backend/app/api/routes/jobs.py`

| Endpoint | Behaviour |
|---|---|
| `POST /jobs/create` | Recruiter-gated; validates salary range; invalidates `jobs:search:*` |
| `POST /jobs/get` | Cache-aside on `job:{id}` (TTL 300s); increments `views_count`; emits `job.viewed` |
| `POST /jobs/update` | Recruiter-gated; cache invalidation per-job + search |
| `POST /jobs/search` | MD5-keyed cache (`jobs:search:{hash}`, TTL 120s); supports keyword, location, employment_type, work_mode, seniority, skills, salary_min, status, sort |
| `POST /jobs/close` | State transition `open→closed`; rejects already-closed |
| `POST /jobs/byRecruiter` | Paginated jobs for a recruiter |
| `POST /jobs/save` | `INSERT … UNIQUE` → 409 on duplicate; emits `job.saved` |
| `POST /jobs/savedByMember` | Saved-jobs list with company/title joins |

### 5.3 Application Service

Two implementations exist — both are consistent with the spec:

- **`backend/app/api/routes/applications.py`** (FastAPI, in-process with the core API). Used during local dev and integration tests.
- **`services/application-service/`** (Express, `:8004`). Used in the docker-compose deployment so the application + notifications domain is independently deployable.

| Endpoint | Behaviour |
|---|---|
| `POST /applications/submit` | Verifies job is `open`; `INSERT … UNIQUE (job_id, member_id)` → 409 on duplicate apply; inflates `applicants_count`; **publishes `application.submitted`** (with `location_city/state` for geo analytics) |
| `POST /applications/get` | RBAC-gated (member sees own, recruiter sees own jobs only) |
| `POST /applications/byJob` | Recruiter-only; **byJob result cache** in Redis (`byJob:{job_id}:recruiter:{rid}:page:…`, TTL 60s); cache invalidated by submit/updateStatus |
| `POST /applications/byMember` | Member-only |
| `POST /applications/updateStatus` | Allowed transitions: `submitted/reviewing/interview/offer/rejected`; **publishes `application.statusChanged`** → consumed by application-service to write a Mongo notification |
| `POST /applications/addNote` | Recruiter notes/decision rationale |

### 5.4 Messaging Service — `services/messaging-service/` (Express :8005)

| Endpoint | Behaviour |
|---|---|
| `POST /threads/open` | Idempotent — same participants returns existing thread (200) vs new (201); invalidates inbox cache for ALL participants |
| `POST /threads/get` | Thread metadata |
| `POST /threads/byUser` | Inbox; cache-aside `threadsByUser:{uid}:page:…` (TTL 30s) |
| `POST /messages/send` | **3-attempt retry with exponential backoff** on Mongo write; publishes `message.sent` (envelope-isolated so Kafka issues never fail the request) |
| `POST /messages/list` | Paginated thread messages |
| `POST /messages/markRead` | Per-user read receipt; invalidates only the reader's cache |

### 5.5 Connection Service — `backend/app/api/routes/connections.py`

| Endpoint | Behaviour |
|---|---|
| `POST /connections/request` | Cross-type aware (member ↔ recruiter); rejects self-connect; `UNIQUE` constraint → 409 on duplicate; emits `connection.requested` |
| `POST /connections/accept` | Increments `connections_count` for member participants; sets `responded_at` |
| `POST /connections/reject` | Status transition |
| `POST /connections/list` | Bidirectional (requester or receiver); paginated |
| `POST /connections/pending` / `/sent` / `/withdraw` | Inbox/outbox + cancellation |
| `POST /connections/mutual` | Set intersection of accepted connections (extra credit) |

### 5.6 Analytics / Logging Service

- **`services/analytics-service/`** (Node, `:8006`) is the production endpoint and is the **Kafka consumer** that materializes every domain event into the `events` collection (manual offset commit + idempotency).
- **`backend/app/api/routes/analytics.py`** (FastAPI) provides MySQL-aggregate fallbacks for `top jobs`, `geo`, `funnel`, `member dashboard`.

Endpoints (per spec §6):

| Endpoint | Source of truth |
|---|---|
| `POST /events/ingest` | analytics-service direct-ingest (idempotent via `idempotency_key`) |
| `POST /analytics/jobs/top` | events aggregation (windowed, by metric: `applications | views | saves`) |
| `POST /analytics/funnel` | view → save → apply-start → submit, per `job_id` |
| `POST /analytics/geo` | applicants by city/state from `payload.location_city/state` |
| `POST /analytics/member/dashboard` | profile views (last 30 d) + application status breakdown |
| `POST /analytics/recruiter/dashboard` | top postings, low traction, clicks per posting, saves per day |

---

## 6. Kafka Topics, Envelope, and Idempotency

### 6.1 Topics (created on startup by `analytics-service` admin)

```js
// services/analytics-service/src/config/kafkaAdmin.js
const TOPICS = [
  'job.viewed',
  'job.saved',
  'application.submitted',
  'application.statusChanged',
  'message.sent',
  'connection.requested',
  'ai.requests',
  'ai.results',
  'profile.viewed',
];
// numPartitions: 3, replicationFactor: 1, auto-create disabled in broker
```

### 6.2 Standard JSON envelope (per spec §6.1)

```json
{
  "event_type": "application.submitted",
  "trace_id": "f6a8e7…",
  "timestamp": "2026-05-05T22:41:00Z",
  "actor_id": "1234",
  "entity": { "entity_type": "application", "entity_id": "9876" },
  "payload": { "job_id": 1, "member_id": 1234, "location_city": "San Jose", "location_state": "CA" },
  "idempotency_key": "app-submit-1-1234"
}
```

### 6.3 Idempotency strategy (at-least-once safe)

| Layer | Mechanism |
|---|---|
| Producer | Stable `idempotency_key` per logical event (`app-submit-{job_id}-{member_id}`, `app-status-{aid}-{prev}-{new}`, time-bucketed `md5(viewer:owner:minute)` for profile views) |
| Broker | Default at-least-once delivery |
| Analytics consumer | `autoCommit: false` → write-then-commit; `EventLog.findOne({idempotency_key})` pre-check + `unique` index on `idempotency_key` (catches the race) |
| AI consumer | Redis `claim_idempotency(topic, idem_key)` SET NX (TTL 24h) before running the workflow |
| Application Mongo | `applications` table has `UNIQUE (job_id, member_id)` so duplicate submits map to 409 |

### 6.4 End-to-end async workflow (required §6.1)

`UI → POST /applications/submit → MySQL write + Kafka application.submitted → analytics-service writes events doc → analytics dashboards reflect submit → application-service consumer also drives in-app notifications on statusChanged → UI polls /notifications`. The same `trace_id` propagates through all hops.

---

## 7. Agentic AI Layer (Recruiter Assistant)

Implemented in **`services/recruiter-assistant/`** as a FastAPI service backed by 5 stateless skill microservices (same image, different `uvicorn` entrypoint).

### 7.1 Skills implemented (per spec §7.1)

| Skill | Module | What it does |
|---|---|---|
| **Resume Parser** | `app/agents/resume_parser.py` | LLM (OpenRouter or Groq) extracts `{skills, years_experience, education, current_title}` from resume text. Falls back to a deterministic heuristic parser when LLM/key is unavailable so the rest of the pipeline still runs. |
| **Job–Candidate Matcher** | `app/agents/job_matcher.py` | Sentence-Transformers (`all-MiniLM-L6-v2`) for semantic score; final score = `0.6·semantic + 0.4·skills_overlap`. Returns `{score, semantic_score, skills_overlap, overlap_ratio}`. |
| **Hiring Assistant (Supervisor)** | `app/agents/supervisor.py` | Orchestrates the per-candidate pipeline, batches an entire applicant pool, ranks by score, sets `awaiting_approval` for human review. |
| **Ranking Explainer** | `app/agents/ranking_explainer.py` | LLM produces 4–7 grounded bullets using **pre-computed sets** (matched/missing/extra) so it cannot hallucinate skill arithmetic. |
| **Interview Question Generator** | `app/agents/interview_question_generator.py` | LLM produces technical + behavioral questions targeted at the candidate's skill gaps. |
| **Outreach Drafter** | `app/agents/outreach_drafter.py` | LLM drafts a ≤100-word LinkedIn message with hard rules: only mention skills the candidate actually has, never assume employer, transparent fallback when match is weak. |

### 7.2 Multi-step Kafka workflow (required §7.2)

Topics: `ai.requests` (`event_type=ai.requested`) and `ai.results` (`event_type=ai.completed`, `ai.approval.recorded`).

```text
Recruiter UI ──POST /agent/request──► FastAPI /agent
                                       │
                                       ├─ upsert trace (Mongo) + Redis status="queued"
                                       └─ publish ai.requested → Kafka
                                              │
                                              ▼
              ┌───── ai-agent-group consumer (run_hiring_workflow) ─────┐
              │ for each candidate:                                       │
              │   resume_parser /run  → parsed_resume                     │
              │   matcher /run        → score + semantic + overlap        │
              │   ranking_explainer /run                                  │
              │   interview_questions /run                                │
              │   outreach_drafter /run                                   │
              │   add_step + push WS update + record_match_quality        │
              │ rank by score; set "awaiting_approval"; publish ai.completed
              └───────────────────────────────────────────────────────────┘
                                              │
                                              ▼
Recruiter UI ◄─ WS /ws/{trace_id} live updates as steps complete

Recruiter UI ──POST /agent/approve/{trace_id}──► /agent
   body: {action: approve|edit|reject, candidate_id, edited_draft?}
                                       │
                                       └─ publish ai.approval.recorded → Kafka
                                              │
                                              ▼
              ┌───── consumer: per-candidate count vs ranked_count ─────┐
              │  if all candidates handled → final status =              │
              │    rejected | edited | approved (priority order)         │
              └──────────────────────────────────────────────────────────┘
```

REST + WebSocket surface (`services/recruiter-assistant/app/api/routes.py` + `websocket.py`):

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/health` | Liveness |
| `POST` | `/agent/request` | Queue a workflow (single `resume_text` or batch `candidates[]`) |
| `GET`  | `/agent/status/{trace_id}` | Cached + persisted status |
| `GET`  | `/agent/result/{trace_id}` | Latest trace + ranked list (preview while in_progress) |
| `POST` | `/agent/approve/{trace_id}` | Per-candidate approve / edit / reject |
| `GET`  | `/agent/metrics/match-quality` | Avg score / semantic / overlap, score-bucket counts, recent samples (per spec §7.3) |
| `GET`  | `/agent/metrics/approval-rate` | Counts + approval rate, per-candidate breakdown |
| `WS`   | `/ws/{trace_id}` | Pushes after every step (resume_parsed, match_scored, ranking_explained, …) |

### 7.3 Evaluation targets (spec §7.3)

The system reports **two** quantitative measures (≥ the required 2):

1. **Matching quality** — `record_match_quality` writes per-candidate `{score, semantic_score, overlap_ratio, skills_overlap_count, score_bucket}` to `metrics`; `GET /agent/metrics/match-quality` returns averages, high/medium/low buckets, and sample traces for manual review.
2. **Human-in-the-loop approval rate** — `record_approval_action` tags every approval/edit/reject; `GET /agent/metrics/approval-rate` returns global counts, the approval rate, and per-candidate action history.

### 7.4 Failure handling & idempotency (per spec deliverables)

- **Skill calls** use `_post_with_retries` (exponential backoff, 3–6 retries, per-skill timeouts up to 45 s) — survives matcher cold-start (model download).
- **Per-candidate failures** are isolated: a parse/match failure for one candidate skips that candidate but the rest of the batch continues.
- **Consumer idempotency** is enforced through Redis SET NX on `idempotency_key`.
- **Trace persistence** in Mongo (`agent_traces`, `agent_steps`, `approvals`) makes every step auditable for debug and the demo write-up.

---

## 8. Tier 1 — Client (React SPA)

Stack: React 19, React Router 7, Recharts 3, Vite 8, Vitest. Lives in `frontend/`. Built into static assets and served by Nginx in containers (`frontend/Dockerfile`).

### 8.1 Routes

| Role | Routes |
|---|---|
| **Member** | `/home`, `/network`, `/jobs`, `/messaging`, `/notifications`, `/in/me`, `/in/:memberId`, `/profile/recruiter/:recruiterId` |
| **Recruiter** | `/home`, `/recruiter/dashboard`, `/recruiter/jobs`, `/recruiter/profile`, `/recruiter/talent` (Talent Search + AI Copilot), `/network`, `/messaging` |
| **Public** | `/`, `/login` |

### 8.2 API client

`frontend/src/api/index.js` wraps every backend group (`auth`, `members`, `recruiters`, `jobs`, `applications`, `messaging`, `connections`, `analytics`, `recruiterAssistant`) and unwraps the `{status,data}` envelope. The recruiter assistant client speaks to `/api/agent/*` through the gateway and to `/api/ws/{trace_id}` for live workflow updates.

### 8.3 Key screens

- **Jobs / Job detail** — `/jobs/search`, `/jobs/get`, `/jobs/save` with member-side resume upload (`pdfjs-dist` + `mammoth`).
- **Recruiter Dashboard** — Recharts visualizations of `/analytics/jobs/top`, `/analytics/funnel`, `/analytics/geo`, `/analytics/recruiter/dashboard`.
- **Talent Search** — Recruiter selects a job + applicants; `recruiterAssistant.request(...)` queues an AI workflow; the UI streams `step` updates over WebSocket; the Approval modal supports approve/edit/reject **per candidate** with required `candidate_id`.
- **Member Dashboard** — `/analytics/member/dashboard` (profile views over 30 days + application status breakdown).

### 8.4 Build envs

| Env | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Origin for the API (e.g. `/api` behind the nginx gateway, or `http://127.0.0.1:8010` for direct hits) |
| `VITE_RECRUITER_ASSISTANT_BASE_URL` | Optional separate origin for the AI service |
| `VITE_DEMO_SEED` | `false` in production / staging — prevents synthetic chart fallbacks |

---

## 9. Datasets & Seeding (10K-scale)

The minimum scale target (≥ 10 000 members, jobs, recruiters, with realistic application volume per spec §11) is exceeded.

| Dataset | Source |
|---|---|
| **Resume PDFs** (1 706 unique → 10 000 cycled into GridFS) | Kaggle: `snehaanbhawal/resume-dataset` (organized by job category under `datasets/resumes/data/data/`) |
| **Job postings** | Kaggle: `rajatraj0502/linkedin-job-2023`; topped up with Faker for the 10 000-row target |
| **Members / connections / saved jobs** | Faker + Kaggle profile slices, 10 000 each |
| **Pre-baked SQL dump** | `datasets/linkedin_simulation_seed.sql` (15.5 MB) — auto-loaded by `docker-compose.yml` via `/docker-entrypoint-initdb.d/` |

End-to-end seed in **15 minutes** (see `TEAM_SETUP_GUIDE.md`):

```bash
docker compose up -d                                      # MySQL auto-loads schema + seed SQL
python3 backend/scripts/seed_resumes_gridfs.py            # 10 000 PDFs into MongoDB GridFS
python3 backend/scripts/update_mysql_resume_urls.py       # mongodb://resumes/member_XXXXXX in MySQL
```

Final counts: `10 000 members | 10 000 recruiters | 500 companies | 10 000 jobs | 10 000 applications | 10 000 connections | 5 000 saved jobs | 10 000 resume files`.

---

## 10. Caching, Object Management, and Write Policy

### 10.1 Object management policy

- All write paths use **SQLAlchemy unit-of-work** (`db.add` → `db.commit` → `db.refresh`) for the FastAPI core. All multi-row mutations (e.g. `submit_application` updating both the row and `applicants_count`) sit inside one transaction with `IntegrityError` rollback for the duplicate-apply / duplicate-save / duplicate-email paths.
- Express services use `mysql2/promise` with parameterized queries; the application controller wraps the submit in a single SQL transaction (model-side) before publishing the Kafka event.
- ORM relationships use `joinedload` (`_member_query`) to avoid N+1s when emitting nested profile JSON.

### 10.2 Heavyweight resources

| Resource | Strategy |
|---|---|
| `KafkaProducer` (sync) | Lazy singleton in `backend/app/core/kafka.py`; degrades to no-op + warn log when `ENABLE_KAFKA=false` or broker is down |
| `KafkaConsumer` | Backoff loop with `time.sleep(5)` on connection failure (see `backend/consumer.py`) |
| `aiokafka` (AI service) | `start_consumer` wrapped in an exponential-backoff supervisor task in `services/recruiter-assistant/app/main.py` |
| `redis.Redis` | Lazy singleton in `backend/app/core/redis.py`; cache calls **degrade silently** to a DB hit when Redis is unavailable |
| `MongoClient` | Module-level `MongoClient(timeout=4 s)`; non-fatal if Mongo is down at startup (`ensure_mongo_indexes` returns False, MySQL APIs still serve) |
| `SentenceTransformer('all-MiniLM-L6-v2')` | Loaded once at module import in the matcher service; the `start_period: 120s` healthcheck in compose tolerates the cold-start download |
| `AsyncOpenAI` | Per-request short-lived client (LLM SDK is connection-pooled internally) |

### 10.3 Cache + write-back policy (Redis cache-aside everywhere)

| Key pattern | TTL | Invalidated by |
|---|---|---|
| `job:{job_id}` | 300 s | `jobs/update`, `jobs/save`, `jobs/close`, `applications/submit` (applicants_count drift) |
| `jobs:search:{md5(query)}` | 120 s | `jobs/create`, `jobs/update`, `jobs/close`, `applications/submit` (`cache_delete_pattern('jobs:search:*')`) |
| `member:{member_id}` | 300 s | `members/update`, `members/delete` |
| `byJob:{job_id}:recruiter:{rid}:page:…` (Express) | 60 s | `applications/submit`, `applications/updateStatus` (`cacheDelPattern('byJob:{jid}:*')`) |
| `threadsByUser:{uid}:page:…` (Express) | 30 s | `messages/send` (both participants), `threads/open` (all participants), `messages/markRead` (reader only) |

> **No write-back / read-through.** All writes go to MySQL first; cache is a pure cache-aside. **Don't write unchanged data back** is enforced by the per-field "if value is not None" guard in every `update_*` route — only mutated fields trigger `db.commit`.

---

## 11. Failure Modes & Exception Handling

Every required failure case from the spec is covered:

| Required failure | Implementation |
|---|---|
| **Duplicate email/user** | `members.email` and `recruiters.email` are `UNIQUE`; `IntegrityError` → HTTP 409 with `"A member with this email already exists"` (`backend/app/api/routes/members.py`) |
| **Duplicate application** | `applications` `UNIQUE (job_id, member_id)` → 409 `"Already applied to this job"` (`applications.py:122`) |
| **Apply to a closed job** | `if job.status != 'open': raise 400 "This job is closed and does not accept applications"` (`applications.py:99`) |
| **Message send failure + retry** | 3-attempt loop with linear backoff; final 500 with `retry_count` so the UI can react (`messagingController.js:188`) |
| **Kafka consumer failure + idempotent processing** | analytics-service: `autoCommit:false`, write-then-commit, idempotency pre-check + DB-level unique catch on code 11000; AI: Redis `claim_idempotency` SET NX |
| **Multi-step partial failure** | All multi-row writes wrapped in transactions with `db.rollback()` on `IntegrityError`; AI per-candidate failures isolated and reported via `stats.failed_count` |

Exception hierarchy is normalized at the FastAPI app boundary (`backend/app/main.py`) — every handler returns the project's `{"status":"error","error":{…}}` shape regardless of source.

---

## 12. Performance & Scalability Report

### 12.1 Benchmark scenarios

| Scenario | Target endpoint | Workload |
|---|---|---|
| **A — Read** | `POST /jobs/search` | 100 concurrent threads, 60 s, indexed MySQL search with 10K rows |
| **B — Write** | `POST /applications/submit` | 100 concurrent threads, MySQL write + Kafka publish + Redis invalidation |

The JMeter test plan lives at `jmeter/scenario_A_read_benchmark.jmx`; results are rolled up by `generate_chart.py` into `charts/`.

### 12.2 Required bar charts (B vs B+S vs B+S+K vs B+S+K+Other)

`generate_chart.py` emits the four required charts plus a deployment comparison; the rendered PNGs are committed under `charts/`:

| Chart | File | Snapshot |
|---|---|---|
| Scenario A latency (ms) | `charts/chart_scenario_A_latency.png` | B 1217 → B+S **1119** → B+S+K 1156 → +Other 1197 (Redis caching reduces avg latency ≈ 8 %) |
| Scenario A throughput (req/s) | `charts/chart_scenario_A_throughput.png` | B 74.9 → B+S **81.4** → B+S+K 78.8 → +Other 76.1 (+8.7 % with Redis) |
| Scenario B latency (ms) | `charts/chart_scenario_B_latency.png` | 10 / 10 / 10 / 8 — flat: writes are DB-bound, Redis caches reads, Kafka publish is async |
| Scenario B throughput (req/s) | `charts/chart_scenario_B_throughput.png` | ≈ 10.1 — bound by MySQL transaction rate |
| Deployment comparison | `charts/chart_deployment_comparison.png` | Single 4 ms / 4 519 req/s vs Multi (3 replicas + Nginx) 5 ms / **6 562 req/s** → +45 % throughput for +1 ms latency |

To regenerate after a fresh JMeter run:

```bash
pip3 install matplotlib
python3 generate_chart.py
```

### 12.3 Why we chose this caching policy (cache-aside + invalidation)

- `/jobs/search` and `/jobs/get` are read-heavy, so they pay the full latency reduction from Redis.
- The MD5-keyed search cache retains separate entries per filter combination so paginating through results never poisons another search.
- Writes invalidate **patterns** (`jobs:search:*`, `byJob:{jid}:*`, `threadsByUser:{uid}:*`) instead of single keys, because any write can change ordering on multiple cached pages.
- Idempotency claims (Redis SET NX) protect AI workflows from re-execution on Kafka redelivery.

---

## 13. Analytics Dashboards (Required Graphs)

All graphs from spec §8 are implemented in the React SPA against the `/api/analytics/*` endpoints.

### 13.1 Recruiter / Admin Dashboard (`/recruiter/dashboard`)

| Graph | Endpoint | Source |
|---|---|---|
| Top 10 job postings by applications per month | `POST /analytics/jobs/top` (`metric:applications`) | `events` aggregation in MongoDB grouped by `payload.job_id`, windowed by `window_days` |
| City-wise applications per month for selected job | `POST /analytics/geo` | `events` aggregated by `payload.location_city/state` |
| Top 5 lowest-traction job postings | `POST /analytics/jobs/top` (`sort:asc, limit:5`) | Same pipeline, asc sort |
| Clicks per job posting | `POST /analytics/jobs/top` (`metric:views`) | `job.viewed` events grouped by `entity_id` |
| Saved jobs per day/week | analytics dashboard `/analytics/recruiter/dashboard` | `job.saved` events bucketed by day |

### 13.2 Member Dashboard (`/notifications` + member profile)

| Graph | Endpoint |
|---|---|
| Profile views per day (last 30 days) | `POST /analytics/member/dashboard` → `profile_views_series` |
| Applications status breakdown | `POST /analytics/member/dashboard` → `application_status_breakdown` |

### 13.3 Tracking strategy (spec §10 — analysis report)

Every domain event is emitted with the standard envelope (see §6.2) and persisted in the `events` collection with these indexes:

- `event_type + timestamp DESC` → top jobs, funnel, saves-per-day
- `entity_type + entity_id + timestamp DESC` → per-job/per-member drill-downs
- `actor_id + event_type + timestamp DESC` → member dashboard
- `idempotency_key` UNIQUE → analyst can replay Kafka without inflating the dataset

This ledger is what makes **the same data** drive dashboards, performance metrics (`record_match_quality`), and audit traces — instead of redundant per-feature counters.

---

## 14. Local & Docker Deployment

### 14.1 Full stack (recommended)

```bash
# Optional LLM key for richer agent output (heuristic fallback runs without it)
export OPENROUTER_API_KEY=sk-or-...
export OPENROUTER_MODEL=google/gemma-2-9b-it:free

docker compose up -d            # 17 services, 5 named volumes, 1 bridge network
docker compose ps               # wait for all to report (healthy)

# One-time data load
python3 backend/scripts/seed_resumes_gridfs.py
python3 backend/scripts/update_mysql_resume_urls.py
```

| URL | What |
|---|---|
| `http://localhost:3000` | React SPA (production build via Nginx) |
| `http://localhost:8090/api` | Nginx API gateway (recommended for clients) |
| `http://localhost:8010/docs` | FastAPI Swagger UI for the core backend |
| `http://localhost:8007/docs` | FastAPI Swagger UI for the AI service |
| `http://localhost:8004/8005/8006/health` | Application / Messaging / Analytics microservices |

### 14.2 Backend-only fast loop (no docker)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env             # edit MySQL password
mysql -u root -p linkedin_simulation < schema.sql
docker run -d --name mongo -p 27017:27017 mongo:7        # if not running
docker run -d --name redis -p 6379:6379 redis:7-alpine   # optional, for cache benchmarks
uvicorn app.main:app --reload --port 8000
```

Open **`http://127.0.0.1:8000/docs`** for the live OpenAPI.

### 14.3 AI service standalone (per-developer matcher iteration)

```bash
cd services/recruiter-assistant
cp .env.example .env             # add OPENROUTER_API_KEY
docker compose up -d
docker exec ai_service python -m app.tools.e2e_smoke
```

---

## 15. Testing

| Layer | Where | Run |
|---|---|---|
| **Frontend unit (Vitest)** | `frontend/src/**/__tests__/*.test.{js,jsx}` (Jobs, Network, Messaging, ProfileDelete, RecruiterApplicants, MainFeed, careerCoach, unitFunctions, apiEndpoints) | `cd frontend && npm test` |
| **AI service unit (pytest)** | `services/recruiter-assistant/tests/test_{job_matcher,resume_parser,supervisor}.py` | `cd services/recruiter-assistant && pytest tests/ -v` |
| **AI in-container e2e** | `services/recruiter-assistant/app/tools/e2e_smoke.py` (full pipeline) and `tools/e2e_extended_host.py` (smoke + matcher failure injection) | `docker exec ai_service python -m app.tools.e2e_smoke` |
| **Full-stack integration** | `integration_test.py` (gateway → backend → app/msg/analytics → AI; verifies Kafka events landing in Mongo + Redis cache hits) | `python integration_test.py` |
| **API smoke (bash)** | `simple_integration_test.sh`, `startup_validator.sh`, `scripts/test_analytics.sh` | direct shell |

---

## 16. Mapping to Grading Rubric

| Weight | Requirement | Where it's satisfied |
|---|---|---|
| **40 % Basic operation** | All required endpoints implemented (Profile/Job/Connection/Application/Messaging/Analytics) with correct semantics, RBAC, pagination, and error envelopes | §5; `backend/app/api/routes/*` + `services/{application,messaging,analytics}-service/` |
| **10 % Scalability + Redis caching** | 10K dataset auto-loaded; cache-aside on 5 hot read paths with measured impact (~8 % latency reduction on the read benchmark; +45 % throughput on the multi-replica deployment) | §10–§12; `charts/`, `generate_chart.py`, `jmeter/` |
| **10 % Distributed services** | Compose deploys 17 services across MySQL + MongoDB + Redis + Kafka + 4 application backends + 6 AI microservices behind an Nginx gateway; deployable to AWS ECS via Dockerfiles | §3, §14; `docker-compose.yml`, `nginx/nginx.api-gateway.conf` |
| **15 % Agentic AI (FastAPI)** | Multi-step Kafka workflow with Supervisor + 5 skills, WebSocket progress, per-candidate human-in-the-loop approval, two evaluation metrics (match quality + approval rate), failure isolation, idempotency | §7; `services/recruiter-assistant/app/agents/` + `app/api/` + `app/kafka/` |
| **10 % Analysis report (tracking)** | Standard event envelope, dedicated `events` Mongo collection with 4 compound indexes, `/analytics/*` endpoints + Recharts dashboards | §6, §13 |
| **5 % Client GUI** | Modern React 19 SPA mirroring LinkedIn UX (member + recruiter modes), Recharts dashboards, AI Copilot side panel with WebSocket streaming | §8; `frontend/` |
| **10 % Test class & write-up** | Vitest + pytest + e2e + this report | §15 + `README.md` |

---

## 17. Observations & Lessons Learned

1. **Cache-aside beats clever invalidation.** The per-search MD5 cache key is conservative but trivial to reason about, and pattern invalidation on writes (`jobs:search:*`) avoided a class of staleness bugs we initially had with single-key invalidation.
2. **`autoCommit:false` is the right default for ledger consumers.** Writing first, committing offsets second, and combining a Mongo unique index with an in-process pre-check gives at-least-once safety without writing dedupe code in every endpoint.
3. **Heuristic fallbacks are essential for an LLM-backed agent.** Resume parsing degrades gracefully when an OpenRouter/Groq key is missing or rate-limits, which made the project demoable on networks without API keys.
4. **Per-candidate batching** in the supervisor turned out to be the most useful UX improvement: a recruiter looking at 50 applicants gets a partially ranked list as soon as the first matches finish (`ranked_candidates_preview`), rather than waiting for the entire batch.
5. **Idempotency keys ≠ random UUIDs.** Time-bucketed keys for `profile.viewed` (`md5(viewer:owner:minute)`) prevented refresh-spam from inflating profile-view dashboards — a real-world tracking trap.
6. **Same Dockerfile, multiple `command:`** for the AI skill services kept the image build cache hot and the deploy graph readable.
7. **One env-driven `mysql.cnf` with `AUTO_CREATE_SCHEMA=true` for dev and `false` for compose** lets the same backend work both as a single-process dev API and as a stateless container that depends on `docker-entrypoint-initdb.d/` for the schema.

---

### Quick reference

- **Spec PDF** → `Class_Project_Description_LinkedIn_AgenticAI.pdf`
- **Cross-team contract** → `docs/INTEGRATION.md`
- **Team onboarding (15 min)** → `TEAM_SETUP_GUIDE.md`
- **Backend setup details** → `backend/README.md`
- **Recruiter Assistant deep-dive** → `services/recruiter-assistant/README.md`
- **Datasets & seed instructions** → `datasets/README.md`, `datasets/SEED_INSTRUCTIONS.md`
