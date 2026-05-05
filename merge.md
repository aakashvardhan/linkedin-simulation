# Branch comparison report: `full-stack-with-ai` vs `feature/full-stack-integration`

**Purpose:** Audit two GitHub branches before any merge. **No integration was performed** for this document.

**Repository:** [aakashvardhan/linkedin-simulation](https://github.com/aakashvardhan/linkedin-simulation)

**Branches compared:**

- [full-stack-with-ai](https://github.com/aakashvardhan/linkedin-simulation/tree/full-stack-with-ai)
- [feature/full-stack-integration](https://github.com/aakashvardhan/linkedin-simulation/tree/feature/full-stack-integration)

---

## Refs and divergence

| Role | SHA (short) | Tip commit subject |
|------|-------------|-------------------|
| `full-stack-with-ai` | `44ae8ee` | full stack with ai assistant |
| `feature/full-stack-integration` | `d363fbe` | feat: complete end-to-end integration with all microservices |
| **Merge-base** | `5648cb0` | common ancestor of both tips |

**Shape of history:** Each branch is **one commit** ahead of the same merge-base (a simple diamond). There is no long-running parallel history between these tips.

---

## Scope of changes (since merge-base)

### `full-stack-with-ai` (`44ae8ee`)

- **~51 files**; largest addition is **`services/recruiter-ai-service/`** (orchestrator, Kafka, LLM agents, Docker, tests scaffolding).
- **Backend:** `backend/app/api/router.py` — enables `auth` router; `backend/app/db/mongo.py` — `_create_index_reconcile` helpers and index naming conflict handling.
- **`docker-compose.yml`:** LLM env anchors, infra without fixed `container_name`, Mongo published as `27018:27017`, recruiter-ai related services.
- **Frontend:** Large updates to `frontend/src/pages/RecruiterJobs.jsx`, plus `frontend/Dockerfile`, `frontend/nginx.container.conf`, API client/index, Vite config.
- **`nginx/nginx.api-gateway.conf`:** substantial gateway additions.
- **Scripts:** `scripts/fix_seed_passwords.sql`, `scripts/seed/seed_test_data.sql`.

### `feature/full-stack-integration` (`d363fbe`)

- **8 files**; focused on wiring and ops.
- **`backend/.env`:** Docker-oriented hostnames (`mysql`, `mongo`, `kafka`, `redis`) and compose-friendly settings. **Treat as sensitive** if real credentials are present; prefer `.env.example` for the repo.
- **`backend/app/db/mongo.py`:** per-index `create_index` with `OperationFailure` code 85 handling (overlaps semantically with the AI branch’s approach).
- **New:** `backend/scripts/upload_resumes_to_mongo.py` — GridFS upload and MySQL `resume_url` updates.
- **`docker-compose.yml`:** small net change vs base but overlaps the same file as the AI branch.
- **Frontend:** `frontend/Dockerfile`, `frontend/nginx.conf` (distinct from AI’s `nginx.container.conf` pattern).
- **`nginx/nginx.api-gateway.conf`:** large addition (overlaps path with AI).
- **`services/analytics-service/src/models/eventModel.js`:** small model tweak.

---

## Overlap: files touched by both branch tips

These paths were modified on **both** sides (relative to `5648cb0`):

1. `backend/app/db/mongo.py`
2. `docker-compose.yml`
3. `frontend/Dockerfile`
4. `nginx/nginx.api-gateway.conf`

---

## Files only on `feature/full-stack-integration`

(no overlap with AI-only tree at same paths)

- `backend/.env`
- `backend/scripts/upload_resumes_to_mongo.py`
- `frontend/nginx.conf`
- `services/analytics-service/src/models/eventModel.js`

---

## Predicted merge conflicts (simulation only)

A **`git merge-tree`** simulation merging `origin/full-stack-with-ai` into `origin/feature/full-stack-integration` (reverse order would mirror the same files) indicates:

**Conflict categories**

1. **Changed in both — `backend/app/db/mongo.py`**  
   AI side: `_create_index_reconcile` and helper functions. Integration side: inline `try/except` per index. Same logical indexes; different structure.

2. **Changed in both — `docker-compose.yml`**  
   Overlapping edits: infra naming/ports, healthcheck style, recruiter/LLM services vs minimal integration deltas, `depends_on` / health conditions.

3. **Added in both — `frontend/Dockerfile`**  
   Two independent Dockerfiles at one path — requires a manual unified Dockerfile.

4. **Added in both — `nginx/nginx.api-gateway.conf`**  
   Two large configs — manual union of upstreams, locations, and any WebSocket rules.

**Rough conflict-hunk count:** on the order of **~7** `<<<<<<<` regions in the simulated output (exact count may vary with merge options).

**Likely low conflict risk:** `backend/app/api/router.py` — integration did not change it in its tip commit; AI adds `auth`; simulated merge treated this as auto-merge friendly.

---

## Notes for a future merge (not executed here)

- Prefer merging the **smaller** tip into the **larger** tree first so fewer paths churn (e.g. merge `feature/full-stack-integration` into `full-stack-with-ai`), then resolve the four hot paths above.
- **`mongo.py`:** Usually keep one strategy — the AI branch’s reconcile helpers are a strong candidate if they subsume code-85 handling.
- **`docker-compose.yml`:** Align Mongo host port policy (`27017` vs `27018`) with how the team runs local Mongo / Compass.
- **`nginx.api-gateway.conf`:** Union routes so backend, analytics, and recruiter-ai (and websockets if used) are all reachable.
- **Secrets:** Avoid committing real `.env` values; document placeholders.

---

## How this report was produced

- `git fetch origin full-stack-with-ai feature/full-stack-integration` (when needed)
- `git merge-base`, `git log`, `git diff --name-only`, `git show --stat`
- `git merge-tree $(merge-base) branch-a branch-b` for conflict prediction

*Regenerate after new pushes to either branch.*
