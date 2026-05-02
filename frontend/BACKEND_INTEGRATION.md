# Backend integration guide (frontend)

**Deployment, CORS, health probes, and cross-team contract:** see repository root `docs/INTEGRATION.md`.

This frontend is intentionally **demo-first**, but it ships with a stable REST boundary so backend teams can integrate without refactoring UI pages.

**Branches:** Core-backend wiring (`/members/login`, `/recruiters/login`, success envelopes, job hydration) lives on `**frontend_final`**. The older `**frontend_new`** branch still pointed at `/auth/login`; run `**frontend_final**` (or merge it into your branch) for local integration with the `**feature/core-backend**` API in repo folder `backend/`.

## 1) Contract location

All endpoint paths + payload entrypoints are centralized in:

- `src/api/index.js` (`makeApi()`)

The HTTP client is:

- `src/api/client.js`

Behavior:

- Sends JSON bodies on `POST`
- Adds `Authorization: Bearer <token>` when `authToken` exists in browser storage (set during login)
- Uses `VITE_API_BASE_URL` as the gateway base URL

## 2) Configure environment

Copy `frontend/.env.example` → `frontend/.env` and set:


| Variable                    | Purpose                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`         | Core backend URL for local dev (`**http://127.0.0.1:8000**`); use your gateway if you proxy (e.g. `8080`)                                                                       |
| `VITE_BACKEND_INTEGRATION`  | When `true`, loads jobs after login: `**POST /jobs/search**` (members) or `**POST /jobs/byRecruiter**` (recruiters)                                                             |
| `VITE_REQUIRE_BACKEND_AUTH` | When `true`, disables silent demo login fallback — `**/members/login**` or `**/recruiters/login**` must succeed                                                                 |
| `VITE_DEMO_SEED`            | When `false` (**default in `.env.example`**): empty feed/jobs/network at startup, no synthetic applicants, no chart fallbacks, no DummyJSON merge unless `VITE_OPEN_SEED` is on |
| `VITE_CAREER_COACH_OFFLINE` | When `true`, allows the local rule-based coach if `/ai/career-coach` and `/ai/request` fail                                                                                     |
| `VITE_REPLACE_SEED_JOBS`    | When `true`, replaces seeded jobs with backend jobs during hydration (if backend returns rows)                                                                                  |
| `VITE_OPEN_SEED`            | Set `false` to skip DummyJSON merge even if demo seed is enabled                                                                                                                |


## 3) Authentication expectations

Login flow (`MockDataContext.login`) tries:

1. `**POST /members/login**` or `**POST /recruiters/login**` with `{ email, password }` (role selects the path).
2. Reads `**token**` from the JSON body (`makeApi` also unwraps `**{"status":"success","data":{...}}**` from the M3/M4 core backend).
3. If token exists, calls `**GET /auth/me**` (best-effort) to enrich profile ids.

Frontend stores:

- `authToken` in `localStorage`
- `userProfile` JSON in `localStorage`

### Important identifiers used in API calls

Several endpoints previously sent `"me"` placeholders. The UI now prefers real identifiers when available:

- `member_id` for applications uses `userProfile.member_id` / `userProfile.id` / email fallback
- analytics ingest uses `actor_id` based on the resolved member key

Backend should return stable ids on `/auth/me`, for example:

```json
{
  "email": "you@company.com",
  "displayName": "Your Name",
  "headline": "…",
  "id": "member-uuid",
  "member_id": "member-uuid"
}
```

(Any subset works; more fields help.)

## 4) CORS

The browser will block calls unless the gateway allows the Vite origin (typically `http://127.0.0.1:5173` / `http://localhost:5173`).

## 5) “Make it real” checklist for backend

Minimum to validate end-to-end in UI with **core backend** (`backend/` on `feature/core-backend`):

- Implement `**POST /members/login`** + `**POST /recruiters/login`** (JWT in response `data.token`), and `**GET /auth/me`** for profile enrichment
- Implement `**POST /jobs/search`** returning `{ status, data: { jobs: [...] } }` or list-like shapes the UI normalizes
- Recruiters: `**POST /jobs/byRecruiter`** with `{ recruiter_id, page, page_size }`
- Optional: `**POST /applications/submit**` with `{ job_id, member_id, resume_text, cover_letter }` (not in core package yet — UI still demos without it)

Optional next endpoints (already referenced by UI):

- `/connections/request`
- `/events/ingest`
- AI:
  - `/ai/career-coach` (Career Coach Agent card on Profile)
  - `/ai/request`, `/ai/status`, `/ai/candidate-match`

### Career Coach (`POST /ai/career-coach`)

The Profile page sends a JSON payload like:

```json
{
  "intent": "career_coach.profile_tailor",
  "job": {
    "id": 123,
    "title": "Software Engineer",
    "company": "Acme",
    "location": "Remote",
    "industry": "Technology",
    "description": "…",
    "type": "Full-time",
    "remote": true
  },
  "member": {
    "headline": "…",
    "about": "…",
    "skills": "…",
    "resume_text": "…"
  }
}
```

Recommended response shape (frontend accepts several aliases, but this is the canonical shape):

```json
{
  "headlineSuggestion": "…",
  "bulletSuggestions": [
    { "text": "…", "rationale": "…" }
  ],
  "aboutSuggestion": "…",
  "rationale": "…",
  "meta": {
    "matchedSkills": ["react", "sql"],
    "jobSignals": ["kafka", "aws"],
    "missingSignalsVsResume": ["kafka"]
  }
}
```

If your gateway wraps payloads as `{ "data": { ... } }`, the UI will unwrap `data` automatically.

## 6) Notes on demo fallbacks

Even when backend endpoints fail, the UI continues using local mock state so demos still work. Flip `**VITE_REQUIRE_BACKEND_AUTH=true**` when you want failures to surface loudly during integration testing.