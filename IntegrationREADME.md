# LinkedIn Simulation — Frontend

React frontend for the LinkedIn Simulation distributed systems class project.

## Tech Stack

- **Vite + React 19** — build tool + UI framework
- **Tailwind CSS** — styling (LinkedIn blue theme)
- **React Router v7** — client-side routing
- **Recharts** — 7 dashboard charts
- **Lucide React** — icons
- **Axios** — HTTP client
- **react-hot-toast** — notifications

## Setup

```bash
npm install
cp .env.example .env    # Add your JSearch API key
npm run dev             # Start dev server at http://localhost:5173
```

### Environment Variables

| Variable | Required | Source |
|---|---|---|
| `VITE_JSEARCH_API_KEY` | Optional | [RapidAPI JSearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) (free tier) |

Without the API key, job search falls back to mock data. All other features work without any keys.

## Pages (23 total)

### Auth (4 pages)
- `/login` — Member login
- `/register` — Member registration
- `/recruiter/login` — Recruiter login
- `/recruiter/register` — Recruiter registration (with company info)

### Member (8 pages)
- `/jobs` — Job search with filters (location, type, industry, seniority, remote)
- `/jobs/:jobId` — Job detail with apply modal (resume upload, cover letter, duplicate check)
- `/saved-jobs` — Saved jobs (localStorage)
- `/applications` — Application tracking with status badges
- `/profile` — Profile with structured experience, education, skills, resume upload, delete account
- `/connections` — Connections list + pending requests (accept/reject/remove)
- `/messaging` — Two-panel messaging (thread list + messages)
- `/dashboard` — 2 charts (profile views line chart, application status pie chart) + stat cards

### Recruiter (10 pages)
- `/recruiter/post-job` — Create/edit job posting (skills, seniority, workplace type, status)
- `/recruiter/my-jobs` — Posted jobs list with edit/close/delete
- `/recruiter/jobs/:jobId/applicants` — Applicant list for a job
- `/recruiter/applications/:appId` — Applicant detail with status dropdown + notes
- `/recruiter/ai-candidates/:jobId` — AI candidate finder (multi-step progress, resume upload)
- `/recruiter/outreach/:taskId` — Outreach approval (approve/edit/reject AI-generated messages)
- `/recruiter/messaging` — Recruiter messaging
- `/recruiter/dashboard` — 5 charts (top jobs bar, city distribution, low traction, clicks, saved jobs)
- `/recruiter/connections` — Recruiter network management
- `/recruiter/profile` — Recruiter profile with company info edit + delete account

### Floating Widget
- **AI Career Coach** — chatbot at bottom-right corner of every page (resume tips, headline suggestions, job matching, interview prep)

## Data Sources

| Source | Used For | Persistence |
|---|---|---|
| JSearch API (RapidAPI) | Real job listings | sessionStorage cache |
| RandomUser API | Profile photos/names | None |
| Mock JSON (`src/data/`) | Applications, connections, threads, dashboards, applicants, AI results | None |
| localStorage | Auth, saved jobs, profile, recruiter jobs, applications, chat history | Browser |

## Backend Integration

All API calls go through `src/api/mockApi.js` — a unified abstraction layer matching the backend API contract:

```
api.members.*       → Profile Service    (POST /members/create, /get, /update, /delete, /search)
api.jobs.*           → Job Service        (POST /jobs/create, /get, /update, /search, /close)
api.applications.*   → Application Service (POST /applications/submit, /get, /byJob, /byMember, /updateStatus)
api.threads.*        → Messaging Service  (POST /threads/open, /get, /byUser)
api.messages.*       → Messaging Service  (POST /messages/list, /send)
api.connections.*    → Connection Service (POST /connections/request, /accept, /reject, /list)
api.analytics.*      → Analytics Service  (POST /analytics/member/dashboard, /jobs/top, /geo)
api.ai.*             → AI Agent Service   (POST /ai/request, /status, WebSocket /ws/ai-task/{taskId})
```

**To connect to real backend:** Replace mock implementations in `mockApi.js` with `apiClient.post(...)` calls. Components don't change.

## Project Structure

```
src/
├── api/          # API clients (jsearch, randomUser, mockApi, apiClient)
├── context/      # AuthContext (login, register, logout, deleteAccount)
├── hooks/        # useAuth, useJobs, useLocalStorage
├── data/         # 8 mock data files
├── layouts/      # MainLayout (navbar+content), AuthLayout (centered card)
├── components/
│   ├── shared/   # Navbar, ProtectedRoute, AIChatWidget, LoadingSpinner, etc.
│   ├── member/   # JobCard, ProfileForm, ConnectionCard, MessageBubble, etc.
│   ├── recruiter/# PostedJobCard, ApplicantCard, AIProgressBar, OutreachCard
│   └── charts/   # 7 Recharts components
└── pages/
    ├── auth/     # 4 login/register pages
    ├── member/   # 8 member pages
    └── recruiter/# 10 recruiter pages
```

## Scripts

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # ESLint
npm run preview   # Preview production build
```
