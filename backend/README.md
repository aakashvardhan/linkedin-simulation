# LinkedIn Simulation M3/M4 Backend

**Integration for other teams & AWS (OpenAPI, auth, CORS, health checks):** see `docs/INTEGRATION.md` at the repository root.

Updated FastAPI backend aligned to the **Group3 API document** for the M3/M4-owned scope and the shared **Database Schema Reference**.

Included services:
- Profile Service
- Job Service
- Connection Service
- Recruiter login/member login with JWT
- Kafka event hooks for `job.viewed`, `job.saved`, and `connection.requested`
- MongoDB `events` collection indexes for idempotent event logging

## API coverage in this package

### Profile Service
- `POST /members/create`
- `POST /members/get`
- `POST /members/update`
- `POST /members/delete`
- `POST /members/search`
- `POST /members/login`
- `POST /recruiters/create`
- `POST /recruiters/get`
- `POST /recruiters/login`

### Job Service
- `POST /jobs/create`
- `POST /jobs/get`
- `POST /jobs/update`
- `POST /jobs/search`
- `POST /jobs/close`
- `POST /jobs/byRecruiter`
- `POST /jobs/save`
- `POST /jobs/savedByMember`

### Connection Service
- `POST /connections/request`
- `POST /connections/accept`
- `POST /connections/reject`
- `POST /connections/list`
- `POST /connections/pending`
- `POST /connections/mutual`

## Contract alignment

This update changes the earlier starter so that it now matches the final team contract more closely:
- numeric IDs in request/response bodies
- standard success envelope: `{"status":"success","data":...}`
- standard error envelope: `{"status":"error","error":{"code":...,"message":"..."}}`
- JWT tokens returned by `/members/login` and `/recruiters/login`
- MySQL tables aligned to the shared schema for `members`, `member_skills`, `member_experience`, `member_education`, `companies`, `recruiters`, `job_postings`, `connections`, `saved_jobs`, and `applications`

## Environment

Copy the template:

```bash
cp .env.example .env
```

Example:

```env
APP_NAME=LinkedIn Simulation M3/M4 Backend
APP_HOST=0.0.0.0
APP_PORT=8000
DEBUG=true
AUTO_CREATE_SCHEMA=true

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DB=linkedin_simulation
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password

MONGO_URI=mongodb://localhost:27017
MONGO_DB=linkedin_simulation

ENABLE_KAFKA=false
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_CLIENT_ID=linkedin-m3m4-backend
KAFKA_CONSUMER_GROUP=linkedin-events-consumer

JWT_SECRET=change-me-in-env
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Because the shared DB doc specifies bcrypt hashes, this project pins a compatible bcrypt version in `requirements.txt`. If you had an older broken install already, run:

```bash
pip uninstall -y bcrypt
pip install -r requirements.txt
```

## Database setup

```bash
mysql -u root -p linkedin_simulation < schema.sql
```

MongoDB database name should also be `linkedin_simulation`.

## Run

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Swagger:

```text
http://127.0.0.1:8000/docs
```

## Seed sample data

```bash
python scripts/seed_sample_data.py
```

Seeded values:
- recruiter email: `riya.shah@tachyonlabs.example`
- recruiter password: `Recruiter123!`
- member email: `ava.patel@example.com`
- member password: `Member123!`
- second member email: `leo.kim@example.com`
- second member password: `Member123!`

## Ingest bundled jobs + resume CSVs

Repo CSVs (synthetic rows in LinkedIn/Kaggle-style columns) live under `../datasets/`. They load into **`job_postings`**, **`companies`**, **`recruiters`**, and **`members`** (+ **`member_skills`**).

```bash
# from backend/ — replace Kaggle exports by using the same paths and headers
PYTHONPATH=. python3 scripts/ingest_demo_data.py

# optional caps
PYTHONPATH=. python3 scripts/ingest_demo_data.py --jobs 200 --members 50
```

Ingested members use email `resume.<ID>@ingest.local` and password **`Member123!`**. Ingested recruiters use **`Recruiter123!`** (`recruiter.<slug>.<company_id>@ingest.local`). Re-run skips duplicate jobs (same company + title) and duplicate member emails.

For a **large** load (10K+, requires `pandas` + `faker`: `pip install pandas faker`), place real cleaned files at `datasets/jobs/clean_jobs.csv` and `datasets/resumes/Resume/Resume.csv`, then run `python scripts/seed_data.py`.

## First smoke test

1. login as recruiter with `/recruiters/login`
2. use the returned JWT in `Authorization: Bearer <token>`
3. create a job with `/jobs/create`
4. login as member with `/members/login`
5. save a job with `/jobs/save`
6. request a connection with `/connections/request`

## Local frontend (repo `frontend/`)

The React app talks to this API using `VITE_API_BASE_URL` (default **`http://127.0.0.1:8000`**).

- Auth: `POST /members/login`, `POST /recruiters/login`, then **`GET /auth/me`** with the JWT.
- Jobs after login: `POST /jobs/search` (members) or **`POST /jobs/byRecruiter`** (recruiters).
- Copy **`frontend/.env.example`** → **`frontend/.env`** and set `VITE_BACKEND_INTEGRATION=true` so jobs hydrate from MySQL.

Quick stack from repo root:

```bash
./scripts/local-full-stack.sh
cd frontend && npm run dev
```
