# Distributed LinkedIn Clone: Tier 1 Client (Frontend Validation Ready) 🚀

This repository encapsulates the full Tier 1 Client codebase corresponding directly to the Distributed Systems UI requirements parameters. The system is fundamentally decoupled and designed explicitly to consume REST/gRPC architectures once your routing structures are integrated.

**Currently, the entire application dynamically manages State mapping locally.** This makes it fully demo-ready to show UI interactivity out-of-the-box before the backend database engines spin up.

## 🛠️ Quickstart

### Prerequisites Check: 
* Need `node` & `npm` locally configured to run Vite servers securely.
* Ensure you navigate identically into `frontend/` rather than the main repo root!

### Configure backend URL (optional but recommended)

Copy `.env.example` to `.env` and set your backend gateway URL:

```bash
cp .env.example .env
```

By default, `VITE_API_BASE_URL` is `http://localhost:8080`.

```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:5173`. 

---

## 🏗️ Architecture Design (For Backend Team)

Where do we intervene to connect the UI payloads directly to your active Kafka streams?

### 1. `src/context/MockDataContext.jsx`
* This acts as the global single-source-of-truth object.
* It now supports **backend integration** via `VITE_API_BASE_URL` (best-effort) while still keeping **local demo fallback** so the UI never “goes blank” if services are down.
* The frontend objects map directly to schemas like `first_name, location, headline, resume`. Example Payload Structure: `4.1 Member`.

### 2. The Recruiter AI Copilot WebSocket
* Look at `src/pages/RecruiterJobs.jsx`.
* There is a deterministic visual simulator under `triggerCopilot()`. It deliberately simulates tracing updates tracking `ai.requests`.
* You just need to strip the `setTimeout` simulation and replace it mapping into a direct `WebSocket()` object tied aggressively to your backend Python service port! You can use `onmessage` handling cleanly to push string logs iteratively up to the array state `setCopilotLog([...prev, event.data.message])` so the UI streams seamlessly!

### 3. Kafka Easy Apply Idempotency
* Look at `src/pages/Jobs.jsx`. 
* I explicitly built an advanced multi-stage modal mimicking Kafka messaging delays under `handleKafkaSubmit`. I even implemented the Exception Case for duplicate application Idempotency violations.
* For the REST mapping: Wrap `application.submitted` fetch functions cleanly around these exact UI blocks so the loader spins seamlessly during transmission handling!

## 📊 Recharts Data Viz
The Member Profile and Recruiter Dashboard dependencies handle `Recharts` graphs implicitly tracking Member Pipeline distributions and View rates. The Backend team only needs to pass standardized metrics matching standard X/Y Axis payload mapping to the Context array arrays!

### Notes:
- To quickly toggle Authentication boundaries during testing without modifying local storage blocks, click the **Demo Controls** directly attached to the bottom Hero panel when launching the app.
