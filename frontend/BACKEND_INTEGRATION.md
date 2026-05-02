# Backend integration guide (frontend)

This frontend is intentionally **demo-first**, but it ships with a stable REST boundary so backend teams can integrate without refactoring UI pages.

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

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Gateway base URL (example: `http://localhost:8080`) |
| `VITE_BACKEND_INTEGRATION` | When `true`, enables **best-effort hydration** after login (currently: `POST /jobs/search`) |
| `VITE_REQUIRE_BACKEND_AUTH` | When `true`, disables silent demo login fallback — `/auth/login` must succeed |
| `VITE_DEMO_SEED` | When `false`, disables DummyJSON + optional seed merges (cleaner integration runs) |
| `VITE_REPLACE_SEED_JOBS` | When `true`, replaces seeded jobs with backend jobs during hydration (if backend returns rows) |
| `VITE_OPEN_SEED` | Set `false` to skip DummyJSON merge even if demo seed is enabled |

## 3) Authentication expectations

Login flow (`MockDataContext.login`) tries:

1. `POST /auth/login` with `{ role, email, password }`
2. Reads token from common shapes: `token`, `access_token`, `accessToken`, `jwt`, etc.
3. If token exists, calls `GET /auth/me` (best-effort) to enrich profile ids.

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

Minimum to validate end-to-end in UI:

- Implement `/auth/login` + `/auth/me`
- Implement `/jobs/search` returning a JSON shape the UI can read:
  - either an array of jobs
  - or `{ jobs: [...] }` / `{ items: [...] }` / `{ results: [...] }`
- Implement `/applications/submit` accepting `{ job_id, member_id, resume_text, cover_letter }`

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

Even when backend endpoints fail, the UI continues using local mock state so demos still work. Flip **`VITE_REQUIRE_BACKEND_AUTH=true`** when you want failures to surface loudly during integration testing.
