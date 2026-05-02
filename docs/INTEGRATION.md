# Integration guide (other teams & AWS)

This document is the contract surface for **backend**, **frontend**, and **adjacent services** (analytics pipelines, AI workers, API gateways). Keep it updated when you add or rename endpoints.

## Quick links

| Resource | URL (replace host with yours) |
|----------|--------------------------------|
| OpenAPI UI | `GET https://<api-host>/docs` |
| OpenAPI JSON | `GET https://<api-host>/openapi.json` |
| Liveness | `GET https://<api-host>/health` |
| Readiness (MySQL + Redis status) | `GET https://<api-host>/health/ready` |

Use **`/health`** for “is the process running?” (ECS/ELB liveness). Use **`/health/ready`** when traffic should only hit the task after **RDS MySQL** is reachable.

## Authentication

- Clients send **`Authorization: Bearer <jwt>`** after login:
  - Members: `POST /members/login`
  - Recruiters: `POST /recruiters/login`
- **Registration** (`POST /members/create`, `POST /recruiters/create`) **commits the row to MySQL**, then returns the same **`token`** (and ids) as login so the SPA can open a session without a second round-trip.
- Session verification: **`GET /auth/me`**

Protect secrets in production (AWS Secrets Manager, SSM Parameter Store, or env injected by ECS/EKS). **Rotate `JWT_SECRET`** and never commit it.

## Response shape

Success (many routes):

```json
{ "status": "success", "data": { } }
```

Errors (HTTP 4xx/5xx):

```json
{ "status": "error", "error": { "code": 403, "message": "…" } }
```

Integrators should branch on HTTP status and optional `status` field, not on body strings.

## Main REST groups (POST-heavy JSON API)

| Area | Examples |
|------|----------|
| Auth | `/auth/me` (GET) |
| Profiles | `/members/*`, `/recruiters/*` |
| Jobs | `/jobs/search`, `/jobs/create`, `/jobs/get`, `/jobs/update`, `/jobs/close`, `/jobs/byRecruiter` |
| Applications | `/applications/submit`, `/applications/byJob`, `/applications/byMember`, `/applications/updateStatus` |
| Connections | `/connections/*` |
| Analytics | `/analytics/jobs/top`, `/analytics/geo`, `/analytics/funnel`, `/analytics/member/dashboard`, `/events/ingest` |

Exact payloads match **Pydantic models** in `backend/app/schemas/` — the OpenAPI export is authoritative.

## Frontend (SPA) configuration

Build-time env (Vite):

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | Origin of the API (no trailing slash), e.g. `https://api.example.com` |
| `VITE_BACKEND_INTEGRATION` | Should be `true` against real services |
| `VITE_DEMO_SEED` | Use `false` in staging/production |

See `frontend/.env.example`.

## Backend configuration (AWS-friendly)

| Variable | Purpose |
|----------|---------|
| `CORS_ORIGINS` | Comma-separated **https** SPA origins, e.g. `https://app.example.com,https://www.example.com`. If **unset**, only local dev origins are allowed — **set this in every deployed environment** that serves a browser UI. |
| `MYSQL_*` | Point to **Amazon RDS** (or equivalent). |
| `REDIS_URL` | ElastiCache Redis connection string (optional; caching degrades gracefully if absent). |
| `MONGO_URI` | Document store for some features; app can start if Mongo is down (see startup logs). |
| `ENABLE_KAFKA` | Set `false` if MSK/Kafka is not wired yet; publisher calls should no-op or log. |
| `JWT_SECRET` | Strong random value in production. |
| `DEBUG` | `false` in production. |

See `backend/.env.example`.

## CORS (critical for browser apps)

Browsers will block your SPA unless **`CORS_ORIGINS`** includes the exact frontend origin (scheme + host + port). After CloudFront or ALB setup, list **every** environment:

- Production UI origin  
- Staging UI origin  
- Optional preview deploy origins  

## Kafka / events (optional)

When enabled, the backend may publish domain events (e.g. `application.submitted`). Consumer teams should:

1. Agree on **topic names** and **payload JSON schema** (stable fields, optional extras).
2. Use a **dedicated consumer group** per service.
3. Treat messages as **at-least-once**; design consumers to be idempotent.

## Versioning & breaking changes

- Prefer **additive** fields in JSON bodies and responses.
- For breaking changes, either version the path (`/v2/...`) or coordinate a migration window and update this doc + OpenAPI.

## Load balancer / target group hints (AWS)

- **Liveness**: `GET /health` → **200**
- **Readiness**: `GET /health/ready` → **200** when MySQL is up; **503** otherwise (drain/unhealthy)
- Idle timeout and WebSocket usage: not required for this REST API; tune ALB idle timeout if clients hold long uploads.

## Support checklist for partner teams

1. Provide **base URL**, **OpenAPI URL**, and **sample login + authenticated call** (curl or Postman collection).
2. Confirm **CORS origins** and **`VITE_API_BASE_URL`** for each environment.
3. Share **error envelope** and **JWT header** format (this page).
4. Document **rate limits** at the gateway (API Gateway / WAF) when you add them.
