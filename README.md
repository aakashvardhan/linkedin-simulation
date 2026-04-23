# linkedlnDS

**Distributed LinkedIn-style client** — a demo UI for coursework and team integration: member **feed**, **jobs**, **network**, **messaging**, **notifications**, **recruiter dashboard**, and a floating **Copilot** panel. Runs fully on **local mock data**; switches to a real backend via **`VITE_API_BASE_URL`** with graceful fallback.

---

## Features

| Area | What’s included |
|------|------------------|
| **Auth & landing** | Public landing, modal sign-in / sign-up, demo accounts, profile name + photo (local persistence) |
| **Member** | Home feed with composer, edit/delete **own** posts, network, jobs, messaging, notifications, profile |
| **Recruiter** | Dashboard (Recharts), job CRUD, recruiter profile, **moderation** (edit/delete any feed post in UI) |
| **Copilot** | Floating chat widget (placeholder replies; ready to wire to WebSocket / agent service) |
| **Recruiter jobs** | Sidebar **Agentic Copilot** simulator (timed steps + log; replace with real AI backend) |
| **Data** | Kaggle-style JSON seeds, optional **DummyJSON** merge, optional **`VITE_EXTRA_SEED_URL`** |
| **Analytics** | Member + recruiter charts; tries live API, falls back to demo series if the server is down |

---

## Tech stack

- **React 19** · **Vite 8** · **React Router 7** · **Recharts** · **react-icons**

---

## Quick start

**Requirements:** Node.js **20+** and npm.

From the **repository root**:

```bash
git clone <your-repo-url>
cd <repo-folder>
npm install    # also installs frontend/ via postinstall
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)**.

Or from **`frontend/`** only:

```bash
cd frontend
npm install
npm run dev
```

### Demo sign-in

Use the accounts called out on the landing page, for example:

| Role | Email (demo) |
|------|----------------|
| Member | `pratiksha@demo.linkdln` |
| Recruiter | `sneha@demo.linkdln` |

Password can be anything in **demo / local** mode.

---

## Scripts (repo root)

| Command | Description |
|---------|-------------|
| `npm install` | Installs root + **`frontend/`** dependencies |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build → `frontend/dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build |

---

## Configuration

Copy **`frontend/.env.example`** → **`frontend/.env`**.

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | API gateway (default `http://localhost:8080`) |
| `VITE_OPEN_SEED` | Set to `false` to skip DummyJSON merge |
| `VITE_EXTRA_SEED_URL` | URL returning JSON: `{ "jobs": [], "posts": [], "connections": [] }` (arrays optional) |

---

## Backend integration

The frontend expects a gateway at `VITE_API_BASE_URL`. Method names and paths are centralized in:

**[`frontend/src/api/index.js`](frontend/src/api/index.js)**

Includes **auth**, **members**, **jobs**, **applications**, **messaging**, **connections**, **analytics** (`/events/ingest`, dashboards), and **AI** stubs. The HTTP client (`frontend/src/api/client.js`) sends JSON and **`Authorization: Bearer <token>`** when a token is stored after login.

Deeper UI ↔ data notes (Kafka-style jobs flow, copilot hooks) live in **`frontend/README.md`**.

---

## Repository layout

```
├── frontend/                 # Vite + React application
│   ├── src/
│   │   ├── api/              # API client + endpoint map
│   │   ├── components/       # Navbar, sidebars, feed, AgentWidget, BrandMark, …
│   │   ├── context/          # MockDataContext (global state + API fallback)
│   │   ├── data/             # openSeedLoader, kaggle/*.json seeds
│   │   ├── layout/           # MainLayout
│   │   └── pages/            # Login, Home, Jobs, Recruiter*, …
│   └── .env.example
├── datasets/                 # Dataset notes (e.g. Kaggle seed sources)
├── scripts/
│   └── kaggle_download_sample.py   # Optional: local Kaggle → JSON
├── package.json              # Root scripts + postinstall → frontend
└── README.md
```

---

## Team workflow

1. Clone the repo and run **`npm install`** / **`npm run dev`**.
2. Backend team implements routes aligned with **`frontend/src/api/index.js`**.
3. Point **`VITE_API_BASE_URL`** at your gateway; keep **`frontend/README.md`** open for feature-specific integration notes.

---

## License

Add a `LICENSE` file for your course or org if required.
