# Hackiwha — System Design Architecture Document

**Brand Market Tracker · Hackiwha 3.0 · Theme 2: Marketing & Branding**

This document is a system-design case study of the Hackiwha autonomous competitive
intelligence platform. It follows the structure of a senior system-design interview
write-up: requirements, capacity estimates, C4-style architecture diagrams at three
levels of detail, sequence diagrams for every major flow, data-model deep-dive, trade-off
analysis, single-point-of-failure audit, and a scaling roadmap.

> This document is intentionally more detailed and more accurate than `Readme.md`.
> Where the two disagree, this document reflects what the code actually does.
> See [Section 14: Corrections vs Readme.md](#14-corrections-vs-readmemd) for a
> full errata table with source citations.

---

## Table of Contents

- [0. Intent](#0-intent)
- [1. Problem Statement & Requirements](#1-problem-statement--requirements)
  - [1.1 Functional Requirements](#11-functional-requirements)
  - [1.2 Non-Functional Requirements](#12-non-functional-requirements)
  - [1.3 Out of Scope](#13-out-of-scope)
  - [1.4 Capacity Estimates](#14-capacity-estimates)
- [2. System Context (C4 Level 1)](#2-system-context-c4-level-1)
- [3. Container View (C4 Level 2)](#3-container-view-c4-level-2)
- [4. Component View (C4 Level 3)](#4-component-view-c4-level-3)
  - [4.1 Backend Internals](#41-backend-internals)
  - [4.2 Worker Internals](#42-worker-internals)
  - [4.3 Frontend Internals](#43-frontend-internals)
- [5. Key Sequence Diagrams](#5-key-sequence-diagrams)
  - [5.1 Manual Pipeline (REST + SSE)](#51-manual-pipeline-rest--sse)
  - [5.2 Scheduled Pipeline](#52-scheduled-pipeline)
  - [5.3 Monitoring Diff](#53-monitoring-diff)
  - [5.4 Frontend SSE Consumption](#54-frontend-sse-consumption)
- [6. Data Model](#6-data-model)
  - [6.1 Entity Relationship Diagram](#61-entity-relationship-diagram)
  - [6.2 Table Definitions](#62-table-definitions)
  - [6.3 Indexing Gaps & Data Volume](#63-indexing-gaps--data-volume)
- [7. AI Agent Pipeline Deep-Dive](#7-ai-agent-pipeline-deep-dive)
  - [7.1 Hybrid-Parallel Workflow](#71-hybrid-parallel-workflow)
  - [7.2 Agent-by-Agent](#72-agent-by-agent)
  - [7.3 External API Table](#73-external-api-table)
- [8. IPC & Communication Contracts](#8-ipc--communication-contracts)
  - [8.1 Backend-to-Worker Stdin Contract](#81-backend-to-worker-stdin-contract)
  - [8.2 Worker-to-Backend Stdout Contract](#82-worker-to-backend-stdout-contract)
  - [8.3 SSE Wire Format](#83-sse-wire-format)
  - [8.4 Environment Passthrough](#84-environment-passthrough)
- [9. Trade-Off Matrix](#9-trade-off-matrix)
- [10. Bottlenecks & Single Points of Failure](#10-bottlenecks--single-points-of-failure)
- [11. Scaling Path](#11-scaling-path)
- [12. CAP & Consistency Discussion](#12-cap--consistency-discussion)
- [13. Operational Concerns](#13-operational-concerns)
- [14. Corrections vs Readme.md](#14-corrections-vs-readmemd)
- [15. Appendix](#15-appendix)
  - [15.1 Full Project Structure](#151-full-project-structure)
  - [15.2 Environment Variables](#152-environment-variables)
  - [15.3 Glossary](#153-glossary)

---

## 0. Intent

Hackiwha is an autonomous competitive intelligence platform that runs a multi-agent
AI pipeline to research a user's market, discover and analyse competitors, and
generate a concrete marketing strategy — all streamed to the browser in real time.
It was built as a Hackiwha 3.0 hackathon project for Theme 2 (Marketing & Branding).

The codebase is a polyglot system: a **NestJS 11** backend orchestrating **Python 3.12
AI workers** via `child_process.spawn`, serving a **React 19 + ReactFlow** frontend
through an **nginx** reverse proxy, with all data persisted in **PostgreSQL 16** augmented
by **pgvector** for semantic similarity search on 3072-dimensional Gemini embeddings.

---

## 1. Problem Statement & Requirements

### 1.1 Functional Requirements

| ID | Requirement | Implementation |
|----|-------------|----------------|
| FR-1 | A user triggers an AI pipeline for a given business description and optional known competitors | `POST /api/research/pipeline` with `{ tenantId, businessDescription, knownCompetitors? }` |
| FR-2 | The pipeline runs three sequential research agents, each producing structured JSON | Python `run_pipeline`: Market Intel ‖ Competitor Recon (parallel), then Strategy (gated) |
| FR-3 | Real-time progress is streamed to the browser as each agent completes | SSE endpoint `GET /api/research/runs/:runId/stream`; backend emits `step_completed` per agent |
| FR-4 | The pipeline can be scheduled to re-run automatically on a cadence | `SchedulerService`: 15-minute polling loop + `tenant.nextRunAt` cursor |
| FR-5 | A monitoring agent compares two pipeline runs and detects meaningful changes | `POST /api/monitoring/run` → rule-based diff + optional Gemini synthesis |
| FR-6 | Findings are stored with vector embeddings for future semantic search | pgvector 3072-dim column on `Finding`; workers write directly via psycopg2 |
| FR-7 | A frontend visualises the pipeline as a node-graph with per-stage status and live results | ReactFlow `AgentPipeline` component with SSE-driven state machine |

### 1.2 Non-Functional Requirements

| Category | Requirement | Current State |
|----------|-------------|---------------|
| **Multi-tenancy** | Each brand/business is isolated as a `Tenant` entity | Tenant ID supplied by client; all queries scoped by `tenantId` FK. No RLS. |
| **Real-time UX** | Pipeline progress visible without page refresh | SSE + ReactFlow. Frontend also polls `useRun` every 2s while `status === "running"` as fallback. |
| **Data fidelity** | Agent outputs validated against Pydantic schemas before storage | All agents use Pydantic. Strategy agent uses Gemini's native `response_schema`. |
| **AI cost control** | Minimise redundant LLM/search calls | No caching layer. `search_depth="advanced"` is always used (most expensive Tavily tier). |
| **Availability** | System should tolerate individual agent failures | Per-agent `try/except` in `main.py:41-51` — one failure produces `{"error": ...}` and doesn't kill siblings. |

### 1.3 Out of Scope

These are explicitly not implemented in the current codebase:

- **Authentication / authorization** — `useAuthStore` in the frontend is in-memory only; no JWT, no session, no API key gate. The Zustand store is populated by `LoginPage` but nothing enforces it on navigation or API calls.
- **Rate limiting** — No throttle middleware on NestJS controllers.
- **Structured logging / metrics** — NestJS `Logger` is used; no Pino, no Prometheus endpoint.
- **Audit trail** — No history of who triggered what beyond `triggeredBy: "manual" | "schedule"` on `PipelineRun`.
- **RBAC** — No roles, no permissions, no tenant-scoped access control beyond the FK join.

### 1.4 Capacity Estimates

These are rough back-of-envelope numbers for a single-tenant system running on a single
Docker host (the current deployment model):

| Metric | Estimate | Basis |
|--------|----------|-------|
| **Pipeline runs / tenant / day** | 1–4 (1 manual + 1 scheduled via 24h monitoring interval) | Scheduler interval = 86,400,000 ms (`backend/.env.example:4`) |
| **Gemini API calls / pipeline run** | 5–8 (3–4 agents × 1–2 calls each) | Market Intel: 1 search synthesis. Competitor Recon: 1 discovery + N competitor syntheses (N ≤ 3). Strategy: 1–2 (with retry). Monitoring: 0–1. |
| **Tavily API calls / pipeline run** | 5–9 (3 search queries in scraping + 2×N in analysis) | `scraping/agent.py` runs 3 templates; `analysis/agent.py` runs 2 per competitor, max 3 competitors. |
| **Embeddings stored / run** | 3 (one per agent) | Market Intel, Competitor Recon, Strategy each call `store_finding(...)` with an embedding. |
| **Embedding storage** | 3072 dims × 4 bytes (float32) = 12,288 bytes ≈ 12 KB per finding | 12 KB × ~500 findings/year ≈ 6 MB/year of embedding data. Negligible. |
| **PostgreSQL row growth / run** | ~9 rows (1 PipelineRun + 3 PipelineStep + 3 Finding + 1 MonitoringResult + 0–1 schema overhead) | At 4 runs/day → ~14,600 rows/year. Trivially small for Postgres. |
| **Stdout throughput per pipeline run** | ~3–5 KB of NDJSON | 3 lines of JSON, each 1–2 KB. |

---

## 2. System Context (C4 Level 1)

The outermost view: what actors interact with the system and what external systems
does it depend on.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ENVIRONMENT                                        │
│                                                                                 │
│  ┌──────────────┐              ┌──────────────────────────────────────────────┐  │
│  │              │  HTTP/SSE    │            HACKIWHA PLATFORM                 │  │
│  │  End User    ├─────────────►│                                              │  │
│  │  (Browser)   │◄─────────────┤  React 19 SPA ←→ NestJS 11 API ←→ Python   │  │
│  │              │              │                        Workers               │  │
│  └──────────────┘              │                           │                 │  │
│                                │                    ┌──────▼──────┐          │  │
│                                │                    │ PostgreSQL  │          │  │
│                                │                    │ 16+pgvector │          │  │
│                                │                    └─────────────┘          │  │
│                                └──────┬──────────────────┬───────────────────┘  │
│                                       │                  │                      │
│                                       │ HTTPS            │ HTTPS                │
│                                       ▼                  ▼                      │
│                               ┌──────────────┐  ┌───────────────┐              │
│                               │ Google Gemini │  │    Tavily      │              │
│                               │ (LLM + Embed) │  │ (Web Search +  │              │
│                               │               │  │  Extraction)   │              │
│                               └──────────────┘  └───────────────┘              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Actors:**

| Actor | Description |
|-------|-------------|
| End User | Interacts through the React SPA in a browser. Triggers pipelines, views real-time results, navigates between projects. |
| Scheduler (internal) | A `setInterval` loop inside the NestJS process that polls `Tenant.nextRunAt` every 15 minutes and triggers pipelines + monitoring on a 24-hour cadence. Not a separate service; it is a side-effect module started on `OnModuleInit`. |

**External systems:**

| System | Protocol | Purpose |
|--------|----------|---------|
| Google Gemini (`gemini-3-flash-preview`) | HTTPS via `google-genai` SDK | LLM reasoning, synthesis, strategy generation, monitoring analysis |
| Google Gemini Embeddings (`gemini-embedding-2`) | HTTPS via `google-genai` SDK | 3072-dimensional vector embeddings for pgvector storage |
| Tavily (Search + Extract) | HTTPS via `tavily-python` SDK | Web search (`search_depth="advanced"`) and content extraction |

---

## 3. Container View (C4 Level 2)

Zooming in: the four deployable containers, their responsibilities, ports,
and inter-container communication paths.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Docker Compose Stack                                    │
│                                                                                 │
│  ┌─────────────────────┐     ┌──────────────────────────────────────────────┐   │
│  │     frontend        │     │                  backend                      │   │
│  │  ┌───────────────┐  │     │  ┌────────────────────────────────────────┐  │   │
│  │  │ nginx:alpine  │  │     │  │          Node.js 22 (NestJS 11)       │  │   │
│  │  │  :80          │  │     │  │                                        │  │   │
│  │  │  SPA static   │  │     │  │  ResearchModule    MonitoringModule   │  │   │
│  │  │  /api→backend  │  ├────►│  │  SchedulerModule   PrismaModule      │  │   │
│  │  └───────────────┘  │ HTTP│  │                                        │  │   │
│  │                     │     │  │  Subject<PipelineEvent> (in-process)  │  │   │
│  │  build: 2-stage     │     │  └──────────────┬───────────────────────┘  │   │
│  │  (node→nginx)       │     │                 │ child_process.spawn()    │   │
│  └─────────────────────┘     │  ┌──────────────▼───────────────────────┐  │   │
│                              │  │      Python 3.12 workers             │  │   │
│                              │  │                                        │  │   │
│                              │  │  main.py dispatcher                   │  │   │
│                              │  │  ├─ scraping/agent.py (MI)            │  │   │
│                              │  │  ├─ analysis/agent.py  (CR)           │  │   │
│                              │  │  ├─ strategy/agent.py  (SG)           │  │   │
│                              │  │  └─ monitoring/agent.py (diff)        │  │   │
│                              │  │                                        │  │   │
│                              │  │  tools: db.py, embeddings.py,         │  │   │
│                              │  │         tools.py, retry.py            │  │   │
│                              │  └──────────────┬───────────────────────┘  │   │
│                              └─────────────────┼──────────────────────────┘   │
│                                                │ psycopg2 (direct SQL)       │
│                              ┌─────────────────▼──────────────────────────┐   │
│                              │           PostgreSQL 16 + pgvector          │   │
│                              │                                            │   │
│                              │  :5432 (mapped to :5434 on host)          │   │
│                              │                                            │   │
│                              │  Tables: Tenant, PipelineRun,              │   │
│                              │  PipelineStep, Finding (vector(3072)),     │   │
│                              │  MonitoringResult, Persona                 │   │
│                              └────────────────────────────────────────────┘   │
│                                                                                 │
│  Named volume: pgdata                                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Container details:**

| Container | Base image | Port | Healthcheck | Build |
|-----------|-----------|------|-------------|-------|
| `hackiwha-frontend` | `nginx:alpine` | `80 → 80` | None (relies on backend) | 2-stage: `node:22-slim` builder → `nginx:alpine` runtime. Static `dist/` served by nginx. |
| `hackiwha-backend` | `node:22-slim` | `3000 → 3000` | HTTP GET `/` returns 200 | 2-stage: NestJS `pnpm build` → runtime installs Python 3.12 + pip-installs `workers/requirements.txt` into same container. |
| `hackiwha-postgres` | `pgvector/pgvector:pg16` | `5434 → 5432` | `pg_isready` every 5s | Pre-built image. No custom Dockerfile. |

**Key architectural decision:** The Python workers run **inside the backend container**.
The backend spawns them via `child_process.spawn("python3", ["workers/main.py"])`. This
co-location is deliberate: it avoids needing a separate IPC mechanism (HTTP, gRPC, message
queue) between the NestJS process and the Python process. The trade-off is that the backend
container must include both Node.js and Python runtimes, increasing its image size. The
entire `process.env` (including `DATABASE_URL`, `GEMINI_API_KEY`, `TAVILY_API_KEY`) is
forwarded to the child process, giving the worker direct access to all secrets.

---

## 4. Component View (C4 Level 3)

Zooming into each container's internal component structure.

### 4.1 Backend Internals

```
┌──────────────────────────────────────────────────────────────────┐
│                      NestJS 11 (Node.js 22)                      │
│                                                                  │
│  main.ts                                                        │
│  ├─ CORS (FRONTEND_URL)                                         │
│  ├─ ValidationPipe (transform + whitelist)                      │
│  └─ listen(:3000)                                               │
│                                                                  │
│  app.module.ts                                                  │
│  ├─ ConfigModule.forRoot()                                      │
│  ├─ PrismaModule (@Global)                                      │
│  ├─ ResearchModule                                              │
│  ├─ MonitoringModule                                            │
│  └─ SchedulerModule (OnModuleInit → starts timers)              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ResearchModule                                            │   │
│  │                                                           │   │
│  │  research.controller.ts                                   │   │
│  │  ├─ POST /api/research/pipeline     → 202 {runId,status} │   │
│  │  ├─ GET  /api/research/runs/:id     → PipelineRun+steps  │   │
│  │  ├─ GET  /api/research/runs/:id/findings → Finding[]     │   │
│  │  ├─ GET  /api/research/tenants/:id/findings → Finding[]  │   │
│  │  └─ @Sse /api/research/runs/:id/stream → Observable      │   │
│  │                                                           │   │
│  │  research.service.ts                                      │   │
│  │  ├─ runPipeline(dto)                                      │   │
│  │  │   ├─ prisma.tenant.upsert                              │   │
│  │  │   ├─ prisma.pipelineRun.create(status=running)         │   │
│  │  │   └─ spawnWorker() [fire-and-forget]                   │   │
│  │  │                                                        │   │
│  │  ├─ spawnWorker(runId, dto)                               │   │
│  │  │   ├─ spawn("python3", ["workers/main.py"])             │   │
│  │  │   ├─ stdin.write(JSON) + stdin.end()                   │   │
│  │  │   ├─ stdout: line-buffer → handleWorkerLine()          │   │
│  │  │   ├─ close: code=0→completed, else→failed              │   │
│  │  │   └─ error: → failed (e.g. python3 not on PATH)       │   │
│  │  │                                                        │   │
│  │  ├─ handleWorkerLine(runId, line)                         │   │
│  │  │   ├─ JSON.parse(line) as {step, output}                │   │
│  │  │   ├─ prisma.pipelineStep.create(status=completed)      │   │
│  │  │   └─ pipelineEvents$.next(step_completed)              │   │
│  │  │                                                        │   │
│  │  └─ pipelineEvents$: Subject<PipelineEvent>               │   │
│  │      (single process-wide event bus, filtered by runId)   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ MonitoringModule                                          │   │
│  │                                                           │   │
│  │  monitoring.controller.ts                                 │   │
│  │  ├─ POST /api/monitoring/run           → 202 MonitoringR │   │
│  │  ├─ GET  /api/monitoring/tenant/:id    → latest result   │   │
│  │  └─ GET  /api/monitoring/tenant/:id/history → all        │   │
│  │                                                           │   │
│  │  monitoring.service.ts                                    │   │
│  │  ├─ runMonitoring(dto)                                    │   │
│  │  │   ├─ find currentRun (must be completed)               │   │
│  │  │   ├─ find previousRun (most recent completed, != curr)│   │
│  │  │   ├─ extractStepOutputs(run.steps) → name→output map  │   │
│  │  │   ├─ spawnMonitoringWorker(mode='monitoring')          │   │
│  │  │   ├─ prisma.monitoringResult.create(result)            │   │
│  │  │   └─ tenant.nextRunAt = now + MONITORING_INTERVAL_MS  │   │
│  │  └─ spawnMonitoringWorker(input)                         │   │
│  │      └─ spawn("python3", ...) → buffer stdout → JSON.parse│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ SchedulerModule                                           │   │
│  │                                                           │   │
│  │  scheduler.service.ts                                     │   │
│  │  ├─ OnModuleInit:                                         │   │
│  │  │   setInterval(handleScheduledRuns,    15 * 60_000)    │   │
│  │  │   setInterval(handleMonitoringRuns,   24 * 60 * 60_000)│  │
│  │  │                                                        │   │
│  │  ├─ handleScheduledRuns()                                 │   │
│  │  │   ├─ find tenants where nextRunAt ≤ now                │   │
│  │  │   ├─ for each: create PipelineRun(triggeredBy=schedule)│   │
│  │  │   ├─ triggerPipelineRun() → spawn Python, await result │   │
│  │  │   └─ savePipelineSteps() → createMany (bulk insert)    │   │
│  │  │                                                        │   │
│  │  └─ handleMonitoringRuns()                                │   │
│  │      ├─ find all tenants                                  │   │
│  │      ├─ for each: find latest completed run               │   │
│  │      ├─ if no MonitoringResult for that run → run monitor │   │
│  │      └─ deduplication: existing = findFirst({currentRunId})│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ PrismaModule (@Global)                                    │   │
│  │                                                           │   │
│  │  prisma.service.ts                                        │   │
│  │  ├─ extends PrismaClient (Prisma 7, CJS output)          │   │
│  │  ├─ uses PrismaPg adapter with pg Pool                    │   │
│  │  └─ $connect() on module init                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Worker Internals

```
┌──────────────────────────────────────────────────────────────────┐
│                      Python 3.12 Worker                           │
│                                                                  │
│  main.py  (entry point, 91 lines)                               │
│  ├─ _parse_input()     → sys.stdin.read() → json.loads          │
│  ├─ _emit(name, output) → json.dumps → print(flush=True)        │
│  │                                                                │
│  ├─ run_pipeline(input_data):                                    │
│  │   ├─ ThreadPoolExecutor(max_workers=2):                       │
│  │   │   ├─ future_mi ← scraping.agent.run(...)  ─┐ parallel     │
│  │   │   └─ future_cr ← analysis.agent.run(...)  ─┘              │
│  │   ├─ _emit("market_intelligence", result)                     │
│  │   ├─ _emit("competitor_recon", result)                        │
│  │   ├─ if both succeeded:                                       │
│  │   │   └─ strategy.agent.run(...)                              │
│  │   └─ _emit("strategy_output", result)                         │
│  │                                                                │
│  └─ run_monitoring(input_data):                                  │
│      └─ monitoring.agent.run(...) → return dict                  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Shared Modules                                               │  │
│  │                                                               │  │
│  │  config.py      — frozen dataclass Settings (env vars)        │  │
│  │  db.py          — psycopg2 singleton, autocommit              │  │
│  │                 — create_run, store_finding, get_findings_    │  │
│  │                    by_run, cosine_similarity, ensure_tenant   │  │
│  │  embeddings.py  — gemini-embedding-2 (3072-dim)              │  │
│  │  tools.py       — Tavily web_search (advanced) + web_fetch    │  │
│  │  retry.py       — generate_with_retry (429 only, exp backoff)│  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Agents                                                       │  │
│  │                                                               │  │
│  │  scraping/agent.py     — Market Intelligence                  │  │
│  │  analysis/agent.py     — Competitor Reconnaissance            │  │
│  │  strategy/agent.py     — Strategy Generation                  │  │
│  │  monitoring/agent.py   — Change Detection                     │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 Frontend Internals

```
┌──────────────────────────────────────────────────────────────────┐
│                 React 19 SPA (Vite 8, TypeScript 6)              │
│                                                                  │
│  main.tsx                                                        │
│  └─ StrictMode → BrowserRouter → QueryProvider → ThemeProvider    │
│       → App                                                      │
│                                                                  │
│  App.tsx (react-router-dom v7)                                  │
│  ├─ /                  → SplashPage                              │
│  ├─ /login             → LoginPage                               │
│  ├─ /projects          → ProjectsPage                            │
│  ├─ /projects/:id      → ProjectDetailPage                       │
│  └─ /agents            → AgentsPage                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Data Layer                                                  │  │
│  │                                                              │  │
│  │  services/api.ts       — fetch wrapper, EventSource for SSE │  │
│  │  hooks/usePipeline.ts  — useTriggerPipeline, useRun,        │  │
│  │                          useRunFindings, useTenantFindings,  │  │
│  │                          usePipelineStream                   │  │
│  │  hooks/useMonitoring.ts — useTriggerMonitoring,              │  │
│  │                           useLatestMonitoring,              │  │
│  │                           useMonitoringHistory              │  │
│  │  providers/query-provider.tsx — QueryClient                 │  │
│  │                          (staleTime=30s, retry=1)           │  │
│  │  stores/auth.ts       — Zustand (in-memory, no persistence)│  │
│  │  stores/projects.ts   — Zustand (in-memory, seeded w/ 2    │  │
│  │                         example projects)                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Visualization Layer                                         │  │
│  │                                                              │  │
│  │  components/AgentPipeline.tsx  — core orchestrator (489 ln) │  │
│  │  ├─ 4-stage taxonomy: Research→Logic→Synthesis→Judge        │  │
│  │  ├─ STEP_TO_STAGE map: {market_intelligence:0,              │  │
│  │  │                      competitor_recon:1, strategy_output:2}│ │
│  │  ├─ SSE consumer via usePipelineStream                      │  │
│  │  ├─ enrichedNodes useMemo (live state → ReactFlow data)     │  │
│  │  ├─ enrichedEdges (active edge = magenta + animated)        │  │
│  │  └─ Judge stage = purely cosmetic timer (2.6s)              │  │
│  │                                                              │  │
│  │  components/AgentNode.tsx       — custom ReactFlow node     │  │
│  │  ├─ Renders per-stage panels (quick-input, results, judge)  │  │
│  │  └─ motion animations (Framer Motion)                       │  │
│  │                                                              │  │
│  │  ReactFlow (@xyflow/react v12)                              │  │
│  │  ├─ nodeTypes = {agentNode: AgentNode}                      │  │
│  │  ├─ nodesDraggable, nodesConnectable=false                  │  │
│  │  └─ fitView, Background grid                                │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Key Sequence Diagrams

### 5.1 Manual Pipeline (REST + SSE)

The primary user-facing flow: clicking "Launch Sequence" in the React UI triggers the
entire multi-agent pipeline, with results streaming back in real time.

```
 Frontend                Backend (NestJS)              Python Worker
    │                         │                              │
    │  POST /api/research/    │                              │
    │  pipeline               │                              │
    │  {tenantId, business..} │                              │
    ├────────────────────────►│                              │
    │                         │  tenant.upsert()             │
    │                         │  pipelineRun.create(         │
    │                         │    status='running',         │
    │                         │    triggeredBy='manual')     │
    │                         │                              │
    │◄── 202 {runId, status}  │                              │
    │                         │                              │
    │  GET /api/research/     │  spawn("python3",            │
    │  runs/:runId/stream     │    ["workers/main.py"])      │
    │  [EventSource]          │         │                    │
    ├────────────────────────►│         │  stdin.write(      │
    │                         │         │    JSON{mode,       │
    │                         │         │     tenant_id, ...})│
    │                         │         │  stdin.end()        │
    │                         │         ├───────────────────►│
    │                         │         │                    │
    │                         │         │           _parse_input()
    │                         │         │           ThreadPoolExecutor:
    │                         │         │             MI.run() ‖ CR.run()
    │                         │         │                    │
    │                         │  stdout line: {"step":      │
    │                         │    "market_intelligence",   │
    │                         │    "output": {...}}         │
    │                         │◄───────────────────────────│
    │                         │  pipelineStep.create()       │
    │                         │  pipelineEvents$.next(       │
    │                         │    step_completed)           │
    │                         │         │                    │
    │  data: {"type":         │         │                    │
    │   "step_completed",     │         │                    │
    │   "stepName":           │         │                    │
    │   "market_intelligence"}│         │                    │
    │◄────────────────────────┤         │                    │
    │                         │         │           Strategy.run()
    │                         │  stdout line: {"step":      │
    │                         │    "strategy_output",...}   │
    │                         │◄───────────────────────────│
    │                         │  pipelineStep.create()       │
    │                         │  pipelineEvents$.next(       │
    │                         │    step_completed)           │
    │  data: {"type":         │         │                    │
    │   "step_completed",     │         │                    │
    │   "stepName":           │         │                    │
    │   "strategy_output"}    │         │                    │
    │◄────────────────────────┤         │                    │
    │                         │  close code=0                │
    │                         │  pipelineRun.update(         │
    │                         │    status='completed')       │
    │                         │  pipelineEvents$.next(       │
    │                         │    run_completed)            │
    │  data: {"type":         │         │                    │
    │   "run_completed"}      │         │                    │
    │◄────────────────────────┤         │                    │
```

### 5.2 Scheduled Pipeline

The scheduler path uses a **different stdout protocol** than the manual path: instead of
streaming NDJSON line-by-line, it buffers the entire stdout and parses it as a single
JSON document.

```
 SchedulerService              Backend                         Python Worker
       │                          │                                 │
       │  setInterval fires       │                                 │
       │  (every 15 minutes)      │                                 │
       │                          │                                 │
       │  tenant.findMany(        │                                 │
       │    where: nextRunAt≤now) │                                 │
       │                          │                                 │
       │  for each due tenant:    │                                 │
       │    pipelineRun.create(   │                                 │
       │      triggeredBy=        │                                 │
       │      'schedule')         │                                 │
       │                          │                                 │
       │  triggerPipelineRun()    │                                 │
       │    spawn("python3",      │                                 │
       │      ["workers/main.py"])│                                 │
       │    stdin.write(JSON)     │                                 │
       │    stdin.end()           │                                 │
       │                          ├────────────────────────────────►│
       │                          │                                 │
       │                          │  [entire stdout buffered]       │
       │                          │  stdout += data.toString()      │
       │                          │                                 │
       │                          │  close code=0                   │
       │                          │◄────────────────────────────────│
       │                          │                                 │
       │                          │  JSON.parse(stdout)             │
       │                          │  → Record<string, unknown>      │
       │                          │                                 │
       │                          │  pipelineRun.update(            │
       │                          │    status='completed')          │
       │                          │                                 │
       │                          │  savePipelineSteps(             │
       │                          │    createMany(entries))         │
       │                          │  → bulk insert PipelineSteps    │
       │                          │                                 │
```

### 5.3 Monitoring Diff

```
 Frontend               Backend (NestJS)              Python Worker
    │                         │                              │
    │  POST /api/monitoring/  │                              │
    │  run                    │                              │
    │  {tenantId,             │                              │
    │   currentRunId}         │                              │
    ├────────────────────────►│                              │
    │                         │  currentRun = findUniqueOrThrow│
    │                         │  assert status='completed'   │
    │                         │                              │
    │                         │  previousRun = findFirst(    │
    │                         │    tenantId, status=completed,│
    │                         │    id != currentRunId,       │
    │                         │    orderBy: completedAt desc) │
    │                         │                              │
    │                         │  extractStepOutputs(         │
    │                         │    currentRun.steps) → curr  │
    │                         │  extractStepOutputs(         │
    │                         │    previousRun.steps) → prev │
    │                         │                              │
    │                         │  spawnMonitoringWorker(      │
    │                         │    mode='monitoring',        │
    │                         │    current_run_data,         │
    │                         │    previous_run_data, ...)   │
    │                         │         │                    │
    │                         │         │  stdin.write(JSON) │
    │                         │         ├───────────────────►│
    │                         │         │                    │
    │                         │         │  monitoring.agent  │
    │                         │         │  .run(...)         │
    │                         │         │                    │
    │                         │         │  7-dim rule-based  │
    │                         │         │  diff + cosine     │
    │                         │         │  similarity on     │
    │                         │         │  embeddings        │
    │                         │         │                    │
    │                         │         │  if significant:   │
    │                         │         │    Gemini synthesis│
    │                         │         │                    │
    │                         │  stdout: single JSON        │
    │                         │◄───────────────────────────│
    │                         │                              │
    │                         │  monitoringResult.create(    │
    │                         │    significantChangeDetected,│
    │                         │    changes, alertMessage,    │
    │                         │    conceptForValidation)     │
    │                         │                              │
    │                         │  tenant.nextRunAt =          │
    │                         │    now + MONITORING_INTERVAL │
    │                         │    _MS                      │
    │                         │                              │
    │◄── 202 MonitoringResult ┤                              │
```

### 5.4 Frontend SSE Consumption

```
 AgentPipeline.tsx              usePipeline.ts              EventSource
       │                              │                         │
       │  currentRunId set            │                         │
       │  (after mutation success)    │                         │
       │                              │                         │
       │  usePipelineStream(          │                         │
       │    currentRunId,             │                         │
       │    handlePipelineEvent)      │                         │
       │                              │                         │
       │                              │  new EventSource(       │
       │                              │    "/api/research/      │
       │                              │     runs/:id/stream")   │
       │                              ├────────────────────────►│
       │                              │                         │
       │                              │  es.onmessage = (msg) =>│
       │                              │    event = JSON.parse(  │
       │                              │      msg.data)          │
       │                              │    onEventRef.current(  │
       │                              │      event)             │
       │                              │◄────────────────────────│
       │                              │  {type:step_completed,  │
       │                              │   stepName:market_int..}│
       │                              │                         │
       │  handlePipelineEvent(event)  │                         │
       │  ├─ step_completed:          │                         │
       │  │   stageStates[0] =        │                         │
       │  │     "complete"            │                         │
       │  │   stageStates[1] =        │                         │
       │  │     "processing"          │                         │
       │  │   setMarketIntel(output)  │                         │
       │  │                           │                         │
       │  ├─ enrichedNodes useMemo    │                         │
       │  │   re-computes:            │                         │
       │  │   node[0].data.state =    │                         │
       │  │     "complete"            │                         │
       │  │   node[0].data.marketIntel│                         │
       │  │     = MarketIntelOutput   │                         │
       │  │   node[1].data.isActive = │                         │
       │  │     true                  │                         │
       │  │                           │                         │
       │  └─ ReactFlow re-renders     │                         │
       │     with enrichedNodes       │                         │
       │                              │                         │
```

---

## 6. Data Model

### 6.1 Entity Relationship Diagram

```
┌─────────────────────┐
│       Tenant         │
├─────────────────────┤
│ id          UUID PK  │
│ name        String   │
│ businessDescription? │
│ nextRunAt?  Timestamptz │
│ createdAt   Timestamptz │
└─────────┬───────────┘
          │
          │ 1:N
          │
  ┌───────┼──────────────────────────────┐
  │       │                              │
  ▼       ▼                              ▼
┌──────────────────┐           ┌──────────────────┐
│   PipelineRun    │           │    Finding        │
├──────────────────┤           ├──────────────────┤
│ id       UUID PK │           │ id        UUID PK │
│ tenantId UUID FK │           │ tenantId  UUID FK │
│ status   String  │           │ runId?    UUID    │
│ triggeredBy      │           │ source    String  │
│ startedAt        │           │ content   String  │
│ completedAt?     │           │ embedding vector  │
└────────┬─────────┘           │   (3072 dims)    │
         │                     │ createdAt         │
         │ 1:N                 └──────────────────┘
         ▼
┌──────────────────────┐      ┌─────────────────────────┐
│    PipelineStep      │      │   MonitoringResult      │
├──────────────────────┤      ├─────────────────────────┤
│ id          UUID PK  │      │ id               UUID PK│
│ runId       UUID FK  │      │ tenantId         UUID FK│
│ stepName    String   │      │ currentRunId     UUID   │
│ status      String   │      │ previousRunId?   UUID   │
│ inputJson?  JSON     │      │ significantChangeDetected│
│ outputJson? JSON     │      │ changes          JSON   │
│ errorText?  String   │      │ alertMessage?    String │
│ startedAt?  Timestamptz    │ conceptForValidation?    │
│ completedAt?Timestamptz    │ createdAt  Timestamptz  │
└──────────────────────┘      └─────────────────────────┘

┌──────────────────┐
│     Persona      │  (reserved for future use; unused in code)
├──────────────────┤
│ id       UUID PK │
│ tenantId UUID FK │
│ name     String  │
│ systemPrompt     │
│ isDefault Bool   │
└──────────────────┘
```

### 6.2 Table Definitions

#### Tenant

Multi-tenant root entity. Each tenant represents a brand/business being tracked.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, `gen_random_uuid()` | Client-supplied (frontend generates UUIDs via `crypto.randomUUID()`) |
| `name` | String | NOT NULL | Display name (defaults to `tenantId` if not provided) |
| `businessDescription` | String? | Nullable | Free-text description fed to AI agents |
| `nextRunAt` | Timestamptz? | Nullable | Scheduler cursor: only runs pipeline when `nextRunAt ≤ now` |
| `createdAt` | Timestamptz | `now()` | Creation timestamp |

#### PipelineRun

Tracks each execution of the research pipeline.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Auto-generated by Postgres |
| `tenantId` | UUID | FK → Tenant, CASCADE | Owning tenant |
| `status` | String | Default `"running"` | `running` \| `completed` \| `failed` |
| `triggeredBy` | String | NOT NULL | `manual` (REST) \| `schedule` (cron) |
| `startedAt` | Timestamptz | `now()` | Run start time |
| `completedAt` | Timestamptz? | Nullable | Set when close handler fires (code=0 or non-zero) |

#### PipelineStep

Individual step within a pipeline run. Each agent produces one step via stdout NDJSON.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Auto-generated |
| `runId` | UUID | FK → PipelineRun, CASCADE | Parent run |
| `stepName` | String | NOT NULL | `market_intelligence` \| `competitor_recon` \| `strategy_output` |
| `status` | String | Default `"pending"` | Always persisted as `"completed"` (no intermediate writes) |
| `inputJson` | JSON? | Nullable | Never populated by the code (schema declared but unused) |
| `outputJson` | JSON? | Nullable | The agent's structured output (e.g. `MarketIntelOutput`) |
| `errorText` | String? | Nullable | Never populated (errors are stored inside `outputJson` as `{"error": ...}`) |
| `startedAt` | Timestamptz? | Nullable | Set to `new Date()` at parse time (same as completedAt) |
| `completedAt` | Timestamptz? | Nullable | Set to `new Date()` at parse time |

> **Note:** The `status: "pending"`, `inputJson`, and `errorText` columns exist in the
> Prisma schema but are never actually written by either the REST or scheduler code paths.
> Every step is persisted with `status: "completed"` and no `inputJson`. Errors are embedded
> inside `outputJson` as `{"error": "..."}` instead of using `errorText`.

#### Finding

Research findings stored with pgvector embeddings for semantic search and monitoring comparison.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Auto-generated |
| `tenantId` | UUID | FK → Tenant, CASCADE | Owning tenant |
| `runId` | UUID? | Nullable | Source pipeline run (nullable — findings can outlive runs) |
| `source` | String | NOT NULL | `market_intel` \| `competitor_recon` \| `strategy` |
| `content` | String | NOT NULL | JSON-serialized agent output (stored as JSONB) |
| `embedding` | vector(3072)? | Nullable | Gemini embedding for cosine-similarity comparisons |
| `createdAt` | Timestamptz | `now()` | Creation timestamp |

> **Critical design detail:** `Finding` rows are written directly by the Python workers
> via psycopg2 (`workers/db.py:store_finding`), bypassing the NestJS/Prisma layer entirely.
> The backend only reads `Finding` rows via Prisma. This dual-write pattern (workers write,
> backend reads) works because both share the same PostgreSQL instance and the same
> `DATABASE_URL`.

#### MonitoringResult

Stores change-detection results between pipeline runs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Auto-generated |
| `tenantId` | UUID | FK → Tenant, CASCADE | Owning tenant |
| `currentRunId` | UUID | NOT NULL | Latest run being compared (no FK constraint) |
| `previousRunId` | UUID? | Nullable | Previous run (null on first monitoring run, no FK constraint) |
| `significantChangeDetected` | Boolean | `false` | Whether meaningful changes were found |
| `changes` | JSON | NOT NULL | Array of change descriptions |
| `alertMessage` | String? | Nullable | Human-readable summary |
| `conceptForValidation` | String? | Nullable | Concept needing human review |
| `createdAt` | Timestamptz | `now()` | Creation timestamp |

> **Note:** `currentRunId` and `previousRunId` are plain UUID strings with no `@relation`
> to `PipelineRun`. This is intentional loose coupling — a run can be deleted without
> cascading to monitoring results. The trade-off is loss of referential integrity.

#### Persona

Reserved for future multi-persona AI evaluation. Currently **unused** in any controller,
service, or worker. Exists only in the Prisma schema.

### 6.3 Indexing Gaps & Data Volume

**Missing indexes:**

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| No `@@index` on `PipelineRun(tenantId)` | `findMany({ where: { tenantId } })` scans full table | Add `@@index([tenantId])` |
| No `@@index` on `PipelineStep(runId)` | `findMany({ where: { runId } })` scans full table | Add `@@index([runId])` |
| No `@@index` on `Finding(tenantId, createdAt)` | Tenant findings list (newest first) scans full table | Add `@@index([tenantId, createdAt])` |
| No `@@index` on `MonitoringResult(tenantId, createdAt)` | History query scans full table | Add `@@index([tenantId, createdAt])` |
| No HNSW or IVFFlat index on `Finding(embedding)` | Cosine similarity search will do sequential scan | Add `CREATE INDEX USING hnsw (embedding vector_cosine_ops)` |
| No `@@unique` on `PipelineRun.id` | UUID PKs are unique by default (Postgres `uuid-ossp`) but not explicitly constrained | Add explicit unique if desired |

**Data volume projection (1 tenant, 4 runs/day):**

| Entity | Rows/year | Avg row size | Total |
|--------|-----------|--------------|-------|
| PipelineRun | ~1,460 | ~200 bytes | ~292 KB |
| PipelineStep | ~4,380 | ~5 KB (outputJson) | ~22 MB |
| Finding | ~4,380 | ~5 KB (content) + 12 KB (embedding) | ~76 MB |
| MonitoringResult | ~365 | ~1 KB | ~365 KB |
| **Total** | | | **~99 MB** |

At this scale the database is trivially small. The schema would need rethinking before
scaling to thousands of tenants.

---

## 7. AI Agent Pipeline Deep-Dive

### 7.1 Hybrid-Parallel Workflow

The pipeline is **not** fully sequential as described in `Readme.md:86`. The actual
execution model is a **two-branch parallel fan-out followed by a sequential gate**:

```
                     ┌──────────────────────┐
                     │   run_pipeline()      │
                     │   (main.py:20)        │
                     └──────────┬───────────┘
                                │
                   ┌────────────┴────────────┐
                   │ ThreadPoolExecutor       │
                   │ (max_workers=2)          │
                   │ (main.py:33)            │
                   ├────────────┬────────────┤
                   │            │             │
                   ▼            ▼             │
          ┌──────────────┐  ┌──────────────┐  │
          │ MI Agent     │  │ CR Agent     │  │
          │ (scraping/   │  │ (analysis/   │  │
          │  agent.py)   │  │  agent.py)   │  │
          │              │  │              │  │
          │ 3 Tavily     │  │ Auto-discover│  │
          │ searches     │  │ + per-compet.│  │
          │ + Gemini     │  │ research     │  │
          │ synthesis    │  │ (ThreadPool) │  │
          └──────┬───────┘  └──────┬───────┘  │
                 │                 │           │
                 ▼                 ▼           │
          _emit("market_    _emit("competitor  │
         intelligence")     _recon")           │
                 │                 │           │
                 └────────┬────────┘           │
                          │                    │
                          ▼                    │
                   ┌──────────────┐            │
                   │ Gate check:  │            │
                   │ both OK?     │◄───────────┘
                   │ (main.py:53) │
                   └──────┬───────┘
                          │ yes
                          ▼
                   ┌──────────────┐
                   │ SG Agent     │
                   │ (strategy/   │
                   │  agent.py)   │
                   │              │
                   │ Gemini with  │
                   │ response_    │
                   │ schema       │
                   └──────┬───────┘
                          │
                          ▼
                   _emit("strategy_output")
```

**Key properties:**
- **MI and CR run concurrently** in a `ThreadPoolExecutor(max_workers=2)` at `main.py:33`.
- Each thread can independently fail — exceptions are caught at `main.py:41-44` and `main.py:47-50`
  and stored as `{"error": str(e)}` instead of crashing the pipeline.
- **Strategy only runs if both MI and CR succeed** (`main.py:53`: `if "error" not in market_intel and "error" not in competitor_recon`). If either failed, strategy is skipped with `{"error": "Skipped due to upstream errors"}`.
- **Each agent inside CR also uses its own ThreadPoolExecutor** for per-competitor research
  (`analysis/agent.py:149`), creating up to 3 additional threads per competitor. Peak thread
  count during a run: ~6 (2 outer + up to 4 inner).

### 7.2 Agent-by-Agent

#### Agent 1: Market Intelligence (`workers/scraping/agent.py`, 122 lines)

**Purpose:** Researches the general market landscape for the given business (no competitor names).

**Flow:**
1. `ensure_tenant(tenant_id, business_description)` — idempotent upsert (`db.py:96-101`)
2. `_build_search_context(business_description)` — 3 Tavily searches using hardcoded templates (`scraping/agent.py:30-34`): industry size/growth, pricing models, customer pain points. Top 3 results deep-fetched via `web_fetch()` and truncated to 2000 chars (`scraping/agent.py:57-64`).
3. `_synthesize(business_description, search_context)` — sends all context to Gemini `gemini-3-flash-preview` via `generate_with_retry()` with `system_instruction=SYSTEM_PROMPT`. Output is parsed via `json.loads()` after manual markdown-fence stripping (`scraping/agent.py:97-100`).
4. Pydantic validation: `MarketIntelOutput(**result)` — validates structure.
5. Embedding: `get_embedding(json.dumps(validated.model_dump()))` via `gemini-embedding-2`.
6. `store_finding(agent_type="market_intel", content=..., embedding=...)` — direct psycopg2 write.

**Output schema:** `{industry_summary, market_trends[], typical_pricing_models[], common_customer_pain_points[], sources[]}`

#### Agent 2: Competitor Reconnaissance (`workers/analysis/agent.py`, 173 lines)

**Purpose:** Discovers and researches specific named competitors.

**Flow:**
1. `ensure_tenant(...)`.
2. If `known_competitors` is empty: `_discover_competitors(business_description)` — single Tavily search → Gemini extracts 3-5 competitor names as JSON array (`analysis/agent.py:36-56`).
3. Cap at 3 competitors: `known_competitors = known_competitors[:3]` (`analysis/agent.py:136`).
4. Per-competitor research in parallel via `ThreadPoolExecutor(max_workers=min(len(known_competitors), 3))` (`analysis/agent.py:149`):
   - 2 Tavily searches per competitor (pricing, reviews)
   - Top 2 results deep-fetched, truncated to 2000 chars
   - Gemini synthesis with `system_instruction=SYSTEM_PROMPT`
   - Pydantic validation: `CompetitorOutput(name, pricing_notes, positioning, recent_activity[], review_sentiment_summary, sources[])`
   - Per-competitor error isolation: `try/except` returns a degraded `CompetitorOutput` with `pricing_notes=f"Error researching: {e}"` (`analysis/agent.py:141-146`)
5. Wrap in `CompetitorReconOutput(competitors=[...])`.
6. Embedding + store_finding(agent_type="competitor_recon").

**Output schema:** `{competitors: [{name, pricing_notes, positioning, recent_activity[], review_sentiment_summary, sources[]}]}`

#### Agent 3: Strategy Generation (`workers/strategy/agent.py`, 242 lines)

**Purpose:** Generates an actionable marketing strategy from the research.

**Flow:**
1. `ensure_tenant(...)`.
2. Builds a combined context from market_intel + competitor_recon.
3. Loads pattern library from `workers/strategy_analyst/pattern_library.json` — **this file does not exist** in the repository. `_load_pattern_library()` returns an empty list gracefully (`strategy/agent.py:134-138`).
4. Calls `_call_with_retry(prompt)` — a custom retry loop (`strategy/agent.py:179-203`) that catches `google_exceptions.ResourceExhausted`, `json.JSONDecodeError`, `pydantic.ValidationError`, and generic `Exception`. On validation failure, it appends an "fix this validation error" prompt and retries. Uses Gemini's **native structured output** (`response_mime_type="application/json"` + `response_schema=StrategyOutput`) — unlike the other agents which parse JSON manually.
5. Embedding + store_finding(agent_type="strategy").

**Output schema:** `{analysis: {market_position, swot: {strengths[], weaknesses[], opportunities[{title, description}], threats[{title, description}]}, competitor_gaps[{competitor, gap}]}, strategy: [{pattern, description, cites, expected_impact}]}`

> **Contrary to `Readme.md:401`**, the strategy agent **does** store a Finding with embedding.
> See `strategy/agent.py:234-240`.

#### Monitoring Agent (`workers/monitoring/agent.py`, 402 lines)

**Purpose:** Compares two pipeline runs and detects meaningful changes.

**Flow:**
1. Extracts step outputs from current and previous runs (passed as flat dicts from the backend).
2. For each of 7 dimensions (competitors, pricing, trends, pain points, market size, growth rate, sentiment):
   - Structural diff: compare lists/strings directly.
   - Semantic diff: if both have embeddings, compute cosine similarity via `cosine_similarity()` from `db.py`.
   - **Known bug:** `monitoring/agent.py:332` calls `compare_similarity()` but only imports `cosine_similarity` from `db`. This would raise `NameError` at runtime when the embedding-comparison code path is reached. The structural diff paths are unaffected.
3. If significant changes detected: calls Gemini `gemini-3-flash-preview` via `generate_with_retry()` to produce a business-impact analysis.
4. Returns `{significant_change_detected, changes[], alert_message, concept_for_validation}`.

**Thresholds:**
- `SIGNIFICANT_THRESHOLD = 0.10` (structural change detection, `monitoring/agent.py:14`)
- `EMBEDDING_SIMILARITY_THRESHOLD = 0.85` (semantic shift detection, `monitoring/agent.py:15`)

### 7.3 External API Table

| API | Model/Method | Used By | Purpose | Cost Tier |
|-----|-------------|---------|---------|-----------|
| Google Gemini | `gemini-3-flash-preview` via `client.models.generate_content` | All 4 agents | LLM reasoning and synthesis | Medium (flash model) |
| Google Gemini Embeddings | `gemini-embedding-2` via `client.models.embed_content` | All 3 pipeline agents (not monitoring) | 3072-dim vector embeddings | Low |
| Tavily Search | `client.search(search_depth="advanced")` | Scraping + Analysis agents | Web search (3 queries in scraping, 2×N in analysis) | Medium (advanced depth = most expensive) |
| Tavily Extract | `client.extract(urls=[url])` | Scraping + Analysis agents | Clean content extraction from top URLs | Low |
| PostgreSQL + pgvector | `psycopg2` direct SQL | All agents via `db.py` | Data persistence, vector storage, cosine similarity | Free (self-hosted) |

---

## 8. IPC & Communication Contracts

### 8.1 Backend-to-Worker Stdin Contract

Both the REST path and the scheduler path write a single JSON object to the worker's stdin,
followed by `stdin.end()`. The worker reads the entire input with `sys.stdin.read()`.

**Pipeline mode:**
```json
{
  "mode": "pipeline",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "business_description": "AI-powered fitness coaching app",
  "known_competitors": ["Peloton", "Fitbod"],
  "run_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

| Field | Required | Source |
|-------|----------|--------|
| `mode` | No (defaults to `"pipeline"`) | Always set explicitly by both paths |
| `tenant_id` | Yes | Client-supplied UUID |
| `business_description` | Yes | Free-text from user |
| `known_competitors` | No (defaults to `[]`) | Optional list of competitor names |
| `run_id` | No (worker creates one via `db.create_run` if absent) | Backend generates UUID |

**Monitoring mode:**
```json
{
  "mode": "monitoring",
  "tenant_id": "...",
  "current_run_id": "...",
  "previous_run_id": "...",
  "current_run_data": { "market_intelligence": {...}, "competitor_recon": {...}, "strategy_output": {...} },
  "previous_run_data": { "market_intelligence": {...}, "competitor_recon": {...} }
}
```

### 8.2 Worker-to-Backend Stdout Contract

Two distinct protocols depending on the caller:

**Manual pipeline (REST/SSE path) — NDJSON streaming:**
```
{"step": "market_intelligence", "output": {"industry_summary": "...", ...}}
{"step": "competitor_recon", "output": {"competitors": [...]}}
{"step": "strategy_output", "output": {"analysis": {...}, "strategy": [...]}}
```

Each line is flushed immediately via `print(..., flush=True)` (`main.py:17`). The backend
processes each line independently via `handleWorkerLine()` (`research.service.ts:169-194`).

**Scheduled pipeline — single JSON document:**
```json
{
  "market_intelligence": {"industry_summary": "...", ...},
  "competitor_recon": {"competitors": [...]},
  "strategy_output": {"analysis": {...}, "strategy": [...]}
}
```

The backend buffers all stdout and calls `JSON.parse(stdout)` once (`scheduler.service.ts:149`).

**Monitoring — single JSON document:**
```json
{
  "significant_change_detected": true,
  "changes": ["competitors: new competitor appeared", ...],
  "alert_message": "Significant changes detected in...",
  "concept_for_validation": "Consider reviewing..."
}
```

### 8.3 SSE Wire Format

The backend uses NestJS's `@Sse()` decorator (`research.controller.ts:46-51`) which
automatically sets `Content-Type: text/event-stream` and `Cache-Control: no-cache`.

```
id: 1752240000000
event: step_completed
data: {"type":"step_completed","runId":"...","stepName":"market_intelligence","output":{...}}

id: 1752240002500
event: step_completed
data: {"type":"step_completed","runId":"...","stepName":"strategy_output","output":{...}}

id: 1752240003000
event: run_completed
data: {"type":"run_completed","runId":"..."}
```

| Field | Value | Notes |
|-------|-------|-------|
| `id` | `Date.now()` (millisecond timestamp) | Not a sequence number — no replay support |
| `event` | `step_completed` \| `run_completed` \| `run_failed` | `step_started` is declared in the TypeScript interface (`research.service.ts:10`) but **never emitted** |
| `data` | Full `PipelineEvent` object | Client parses via `JSON.parse(msg.data)` |

### 8.4 Environment Passthrough

The backend spawns workers with `env: { ...process.env }` (`research.service.ts:84`).
This forwards all environment variables including secrets:

| Variable | Used by worker modules |
|----------|----------------------|
| `DATABASE_URL` | `db.py` (psycopg2 connection) |
| `GEMINI_API_KEY` | `config.py` → all agents (via `google-genai` SDK) |
| `GEMINI_EMBEDDING_API_KEY` | `config.py` → `embeddings.py` (defaults to `GEMINI_API_KEY` if unset) |
| `TAVILY_API_KEY` | `config.py` → `tools.py` (Tavily client) |

> **Security implication:** The worker process receives the full backend environment.
> A compromised or misbehaving worker script has unrestricted access to all database
> credentials and API keys. In a multi-replica deployment, each worker subprocess
> would independently hold all secrets.

---

## 9. Trade-Off Matrix

| Decision | Chosen | Alternatives | Consequences |
|----------|--------|-------------|--------------|
| **Worker execution model** | `child_process.spawn()` inside backend container | Bull/Redis queue, Celery, long-running Python daemon, HTTP microservice | Simple to implement and debug. No horizontal scaling of workers — each backend replica can only run one pipeline at a time. No retry on worker crash (the backend marks the run as `failed` and gives up). |
| **IPC protocol** | stdin/stdout JSON | HTTP, gRPC, Unix socket, shared memory | Zero-setup, no network overhead. No bidirectional communication during execution (backend cannot cancel a running worker). |
| **Stdout format (manual)** | NDJSON line-by-line | Single JSON, WebSocket, gRPC stream | Enables real-time SSE streaming. Requires line-buffering logic in backend. Fragile: a single Python traceback line to stdout would be misinterpreted as JSON (handled by catch-and-log in `handleWorkerLine`). |
| **Stdout format (scheduler)** | Single JSON document | Same NDJSON as manual | Simpler to parse (single `JSON.parse`). No streaming. The same Python script must support both protocols. |
| **Vector database** | pgvector (Postgres extension) | Pinecone, Weaviate, Milvus, Qdrant | No additional infrastructure. Limited to sequential scan without HNSW index (no index created). 3072-dim vectors at ~12KB each are on the higher end for pgvector performance. |
| **Real-time updates** | SSE (Server-Sent Events) | WebSocket, polling only, GraphQL subscriptions | Simpler than WebSocket (unidirectional, auto-reconnect, standard browser API). No bidirectional channel (backend cannot push to worker). No `Last-Event-ID` replay (id is `Date.now()`, not a sequence number). |
| **Event bus** | In-process RxJS `Subject<PipelineEvent>` | Redis pub/sub, EventEmitter, message broker | Zero infrastructure. Single-process only — if the backend runs in multiple replicas, SSE streams from different replicas see different events. No persistence — events are lost if the process restarts during a run. |
| **Scheduler** | `setInterval` (raw) | `@nestjs/schedule` (cron expressions), node-cron, Agenda | Minimal dependency. No cron syntax flexibility (hardcoded 15min/24h). No distributed lock — if two replicas are running, both will process the same due tenants. No persistence — timers are lost on restart and restarted from `OnModuleInit`. |
| **Auth** | None (in-memory Zustand flag) | JWT, OAuth, session cookies, API keys | Fast to build for a hackathon. No protection against unauthorised API calls. The `useAuthStore.isAuthenticated` flag is never checked by any route guard or API middleware. |
| **Pydantic validation** | All agents validate output against Pydantic models | Schemaless dicts, JSON Schema only, Gemini response_schema | Catches malformed LLM output before storage. Only the strategy agent uses Gemini's native `response_schema`; other agents parse JSON manually and strip markdown fences. |
| **Gemini retry** | Custom `generate_with_retry()` catching only `ResourceExhausted` | Retry all errors, exponential backoff for all 5xx, circuit breaker | Fast recovery from rate limits (HTTP 429). Network errors, model errors, and validation errors fail immediately. The strategy agent has its own retry loop (`_call_with_retry`) that also catches `JSONDecodeError` and `ValidationError`. |
| **Tavily search depth** | Always `"advanced"` | `"basic"` (cheaper), adaptive based on query | Highest quality results. Most expensive tier for every search. No cost optimization. |
| **Competitor cap** | Hard-coded `[:3]` | Configurable per-tenant, dynamic based on discover count | Prevents runaway API costs. Silently truncates — a user passing 5 competitors gets 3 with no warning. |

---

## 10. Bottlenecks & Single Points of Failure

### 10.1 Backend Process (SPOF #1)

The entire system runs in a single NestJS process. If it crashes or restarts:

- **In-flight pipeline runs are orphaned.** The Python worker continues running (it's a separate OS process), but the backend loses its `Subject<PipelineEvent>` state — SSE streams for those runs are severed. The Python worker will complete and write findings to the database, but the `PipelineRun` status will remain `"running"` forever (no recovery mechanism).
- **Scheduled timers reset.** `setInterval` timers restart from `OnModuleInit`, so the next tick fires 15min/24h after restart, not from the original schedule. No persistence of `nextRunAt` across restarts.
- **SSE connections drop.** Clients receive a connection error. The frontend's `usePipelineStream` closes the `EventSource` on error (`usePipeline.ts:63`) and does not reopen it. The `useRun` polling fallback (2s interval while `status === "running"`) provides resilience for the run status, but step-level events are lost.

### 10.2 PostgreSQL (SPOF #2)

Single Postgres instance with no replication. If it goes down:
- All `Finding` writes from workers fail (autocommit psycopg2 — the worker crashes).
- All `PipelineRun` and `PipelineStep` writes fail.
- The `PipelineRun` status stays `"running"` since the close handler can't update it.
- The frontend can still load cached data from TanStack Query's 30s stale window.

### 10.3 External API Dependencies

| Dependency | Failure mode | Impact |
|-----------|-------------|--------|
| Gemini API (429) | Retry with exponential backoff (5s, 10s, 20s) via `retry.py`. Max 3 attempts. | Agent fails with exception → `{"error": ...}` in step output. Pipeline continues. |
| Gemini API (other errors) | No retry — immediate failure. | Same as above. |
| Tavily API | No retry built into `tools.py`. Propagates to agent's `try/except`. | `web_search` failure kills the agent. `web_fetch` failure per-URL is caught and skipped (`analysis/agent.py:75-78`). |

### 10.4 Worker Process Isolation

Each pipeline run spawns a fresh Python process. This means:
- No shared state between runs (good for isolation).
- No connection pooling for psycopg2 — each process opens its own connection (`db.py:10-18`).
- No warm-up for Gemini clients — each process creates a new `genai.Client()`.
- Up to ~12KB of embedding data per `store_finding()` call over psycopg2 with autocommit.

### 10.5 Missing Infrastructure

| Gap | Risk | Mitigation |
|-----|------|-----------|
| No health check on Python workers | Backend cannot detect a hung worker | `PIPELINE_TIMEOUT` env var defined in `config.py:19` but **never consumed** by any code |
| No rate limiting on API endpoints | Unbounded pipeline triggers could exhaust Gemini/Tavily quotas | None |
| No `Helmet` middleware | Missing security headers (X-Content-Type-Options, HSTS, etc.) | None |
| No structured logging | Difficult to trace issues across backend + worker logs | NestJS `Logger` is used throughout but not configured for JSON output |

---

## 11. Scaling Path

Ordered by implementation effort and impact:

### Phase 1: Quick Wins (days)

| Change | Effort | Impact |
|--------|--------|--------|
| Add `@@index` to Prisma schema for `(tenantId)` on all tables, `(runId)` on `PipelineStep`, and HNSW index on `Finding(embedding)` | Low | Query performance at 100K+ rows |
| Switch Tavily `search_depth` to `"basic"` for non-critical queries | Low | ~50% reduction in Tavily costs |
| Cache Gemini responses by query hash (in-memory LRU or Redis) | Medium | Eliminates redundant LLM calls for identical inputs |
| Add `PIPELINE_TIMEOUT` enforcement (kill worker after N seconds) | Low | Prevents hung workers from holding resources |
| Fix the `compare_similarity` → `cosine_similarity` bug in `monitoring/agent.py:332` | Low | Unblocks monitoring embedding comparison |

### Phase 2: Backend Resilience (weeks)

| Change | Effort | Impact |
|--------|--------|--------|
| Replace in-process `Subject` with Redis pub/sub | Medium | Enables multi-replica backend; SSE streams survive process restarts |
| Add JWT/OAuth authentication | Medium | Secures API endpoints |
| Add `PipelineRun` recovery on restart (scan for `"running"` runs, check if worker process is alive) | Medium | Prevents orphaned runs |
| Replace `setInterval` with `@nestjs/schedule` + Redis-backed distributed lock | Medium | Prevents duplicate scheduled runs across replicas |

### Phase 3: Worker Scaling (weeks)

| Change | Effort | Impact |
|--------|--------|--------|
| Replace `child_process.spawn()` with a message queue (Redis/BullMQ) + worker pool | High | Decouples backend from workers; enables independent scaling |
| Move `Finding` writes through the backend (Prisma) instead of direct psycopg2 | Medium | Single ownership of DB writes; enables connection pooling via Prisma |
| Add a Python worker pool (long-running processes instead of per-run spawn) | High | Eliminates process spawn overhead; enables connection pooling |

### Phase 4: Multi-Tenant Production (months)

| Change | Effort | Impact |
|--------|--------|--------|
| Add PostgreSQL read replicas | High | Offload read-heavy queries (findings, monitoring history) |
| Implement RLS (Row-Level Security) on Postgres | Medium | Database-level tenant isolation |
| Move to a managed vector service (Pinecone/Weaviate) if pgvector hits performance limits | High | Better ANN search at scale with HNSW/IVFFlat |
| Add Prometheus metrics + Grafana dashboards | Medium | Operational visibility |

---

## 12. CAP & Consistency Discussion

### Consistency Model: Eventual

The system is **eventually consistent** by design:

- **Worker writes are autonomous.** The Python worker writes `Finding` rows directly via psycopg2 (`db.py:store_finding`), bypassing the NestJS/Prisma layer. The backend reads these rows via Prisma. If the backend queries `Finding` immediately after the worker completes but before the Postgres transaction is committed, it may see stale data. (Mitigated by `autocommit = True` in `db.py:17`.)

- **SSE events are at-most-once.** The backend emits events on a process-local `Subject`. If the SSE connection drops (network partition, client reconnect), the client misses events. The `useRun` polling fallback (`refetchInterval: 2000` while `status === "running"`) provides at-least-once status updates, but not step-level granularity.

- **No idempotency on `store_finding`.** If the Python worker is retried (e.g., due to a network hiccup), duplicate `Finding` rows are created. There is no deduplication key beyond the auto-generated UUID PK.

### The Pipeline's Consistency Window

```
Client POST          Worker starts         Worker writes Finding     Worker completes
    │                    │                    (psycopg2)                  │
    │ 202 returned       │                    │                           │
    │◄───────────────────┤                    │                           │
    │                    │                    │                           │
    │                    │  SSE: step_completed│                           │
    │◄───────────────────┼────────────────────┤                           │
    │                    │                    │     SSE: run_completed    │
    │                    │                    │◄──────────────────────────┤
    │                    │                    │                           │
```

Between the `step_completed` SSE event (which is emitted by the backend's `handleWorkerLine`
**before** the `Finding` is written to the DB by the worker) and the worker's `store_finding`
call, there is a consistency gap: the backend has persisted the `PipelineStep` row but the
`Finding` row may not yet exist. Any API call to `GET /api/research/runs/:runId/findings`
during this window would return an empty array.

This is acceptable for the current use case (the findings are for future reference, not for
real-time display in the pipeline view). The pipeline view displays `outputJson` from
`PipelineStep`, not from `Finding`.

### Non-Determinism

Two identical pipeline runs (same `tenant_id`, same `business_description`, same `known_competitors`)
will produce **different** `Finding` results because:
- Tavily search results vary over time (different articles indexed).
- Gemini responses are non-deterministic (temperature not set; sampling varies).
- Embeddings of the same text may differ slightly across API calls.

The monitoring agent accounts for this by using **cosine similarity thresholds** (0.85) on
embeddings rather than exact string comparison.

---

## 13. Operational Concerns

### Health Checks

| Component | Healthcheck | Implementation |
|-----------|-------------|----------------|
| Backend | `GET /` returns 200 | `docker-compose.yml:39`: HTTP GET via Node.js one-liner |
| Postgres | `pg_isready -U hackiwha -d hackiwha` | `docker-compose.yml:26`: 5s interval, 5s timeout, 5 retries |
| Frontend | None | Relies on backend being healthy |
| Workers | None | Spawned per-run; no liveness probe |

### Retry & Backoff

| Component | Retry strategy | Conditions |
|-----------|---------------|------------|
| `retry.py:generate_with_retry` | Exponential backoff: 5s, 10s, 20s. Max 3 attempts. | Only catches `google.api_core.exceptions.ResourceExhausted` (HTTP 429). All other errors fail immediately. |
| `strategy/agent.py:_call_with_retry` | Custom retry loop with prompt augmentation | Catches `ResourceExhausted`, `json.JSONDecodeError`, `pydantic.ValidationError`, and bare `Exception`. On validation failure, appends "fix this error" prompt and retries. |
| `tools.py` (Tavily) | No retry | Exceptions propagate to callers. |
| `embeddings.py` | No retry | Exceptions propagate to the agent's `try/except` in `main.py:41-44`. |

### Logging

- NestJS `Logger` is used in `ResearchService`, `MonitoringService`, and `SchedulerService`.
- Python workers use `print(..., flush=True)` for both retry logs and output. No Python `logging` module.
- No structured logging format (JSON logs). No correlation IDs between backend and worker.

### Docker Compose Deployment

```yaml
services:
  postgres:    # pgvector/pgvector:pg16, port 5434→5432, named volume pgdata
  backend:     # node:22-slim + Python 3.12, port 3000, depends_on postgres (healthy)
  frontend:    # nginx:alpine, port 80, depends_on backend (healthy)
```

Health checks ensure startup ordering: postgres must be ready before backend, backend must
be ready before frontend. The `start_period: 30s` on the backend healthcheck gives Prisma
migrations time to run via `entrypoint.sh`.

---

## 14. Corrections vs Readme.md

The original `Readme.md` describes the system in several places inaccurately. This table
lists every discrepancy found during the architecture review, with source citations.

| # | Claim in `Readme.md` | Actual behavior (with source) |
|---|---|---|
| 1 | "Worker runs sequentially" (`Readme.md:86`). "The pipeline runs three agents sequentially" (`Readme.md:342`). | Workers use `ThreadPoolExecutor(max_workers=2)` to run Market Intelligence and Competitor Reconnaissance **in parallel**. Strategy runs sequentially only after both complete. Source: `workers/main.py:33-51`. |
| 2 | `strategy_analyst/` listed as "Standalone FastAPI sub-service" (`Readme.md:497`). | This directory **does not exist** in the repository. The path is referenced in `workers/strategy/agent.py:21` but the file it looks for (`pattern_library.json`) is absent. The `_load_pattern_library()` function returns an empty list gracefully. |
| 3 | Strategy agent: "Returns structured strategy (no DB storage, no embedding)" (`Readme.md:401`). | Strategy agent **does** call `store_finding(agent_type="strategy", content=..., embedding=...)`. Source: `workers/strategy/agent.py:234-240`. Embedding is generated at line 232 via `get_embedding()`. |
| 4 | `step_started` listed as an SSE event type (`Readme.md:103` table). | `step_started` is declared in the `PipelineEvent` TypeScript interface (`backend/src/research/research.service.ts:10`) but is **never emitted** by the backend. Only `step_completed`, `run_completed`, and `run_failed` are actually emitted. |
| 5 | "Gemini Embeddings … Scraping + Analysis agents" (`Readme.md:437`). | **All three** pipeline agents (Scraping, Analysis, **and Strategy**) call `get_embedding()` and `store_finding()`. Source: `workers/strategy/agent.py:232-234`. |
| 6 | "Tavily … Scraping + Analysis agents" (`Readme.md:438`). | Correct — Tavily is only used by Scraping and Analysis agents. Strategy agent does not make web searches (it only synthesises from upstream data). This claim is accurate. |
| 7 | `Persona` table described as "reserved for future use" (`Readme.md:264`). | Correct — the `Persona` model exists in the Prisma schema but is never referenced in any service, controller, or worker. It is completely unused. |
| 8 | Data flow states "Worker runs sequentially" then lists steps as sequential (`Readme.md:86-93`). | As noted in #1, steps 4a and 4b actually run in parallel threads. The sequential listing in the README is misleading. |
| 9 | Scheduler described alongside the manual pipeline without noting the different stdout protocol (`Readme.md:80-94`). | The scheduler path (`scheduler.service.ts:135-158`) buffers the entire stdout and parses it as a single JSON document, while the manual REST path (`research.service.ts:97-111`) processes NDJSON line-by-line. The same Python worker supports both protocols. |
| 10 | `PIPELINE_TIMEOUT` listed as a worker environment variable (`Readme.md:606`). | The variable is defined in `workers/config.py:19` (`pipeline_timeout: int = int(os.getenv("PIPELINE_TIMEOUT", "120"))`) but is **never consumed** by any code in the codebase. It is a dead configuration value. |
| 11 | **Bug not in Readme.md but discovered during review:** `monitoring/agent.py:332` calls `compare_similarity(cur_emb, prev_emb)` but only `cosine_similarity` is imported from `db` (line 9). `compare_similarity` is never defined anywhere in the codebase. This would cause a `NameError` at runtime when the embedding-similarity code path is reached. | The `cosine_similarity` function exists in `workers/db.py:85-93` and is the correct function to call. |

---

## 15. Appendix

### 15.1 Full Project Structure

```
hackiwha/
├── Readme.md                          # Original README (see Section 14 for errata)
├── README2.md                         # This file
├── docker-compose.yml                 # 3 services: postgres, backend, frontend
├── .env.example                       # DATABASE_URL, GEMINI_API_KEY, TAVILY_API_KEY
├── .gitignore                         # .env, node_modules, __pycache__, .venv
├── .dockerignore                      # Excludes frontend/, .git, .env, *.md from backend build
│
├── frontend/                          # React 19 SPA
│   ├── Dockerfile                     # 2-stage: node:22-slim builder → nginx:alpine
│   ├── nginx.conf                     # SPA routing + /api reverse proxy + SSE tuning
│   ├── package.json                   # React 19, Vite 8, TS 6, Tailwind 4, ReactFlow 12,
│   │                                  # Zustand 5, TanStack Query 5, Framer Motion 12,
│   │                                  # react-router-dom 7
│   ├── vite.config.ts                 # @/ alias, /api proxy → localhost:3000
│   ├── tsconfig.json                  # Project-references setup (tsc -b)
│   ├── src/
│   │   ├── main.tsx                   # StrictMode → BrowserRouter → QueryProvider → ThemeProvider
│   │   ├── App.tsx                    # 5 routes: /, /login, /projects, /projects/:id, /agents
│   │   ├── index.css                  # Tailwind v4 CSS-first config, @theme inline, shadcn
│   │   ├── types/api.ts               # TS types mapping 1:1 to backend DTOs
│   │   ├── services/api.ts            # fetch wrapper + EventSource for SSE
│   │   ├── hooks/
│   │   │   ├── usePipeline.ts         # useTriggerPipeline, useRun (polling), usePipelineStream (SSE)
│   │   │   └── useMonitoring.ts       # useTriggerMonitoring, useLatestMonitoring, useMonitoringHistory
│   │   ├── providers/query-provider.tsx # QueryClient (staleTime=30s, retry=1)
│   │   ├── stores/
│   │   │   ├── auth.ts                # Zustand (in-memory, no persistence, no enforcement)
│   │   │   └── projects.ts            # Zustand (in-memory, seeded with 2 example projects)
│   │   ├── components/
│   │   │   ├── AgentPipeline.tsx      # Core pipeline visualization (489 lines)
│   │   │   ├── AgentNode.tsx          # Custom ReactFlow node (328 lines)
│   │   │   └── theme-provider.tsx     # Light/dark/system theme, keyboard shortcut "d"
│   │   └── pages/
│   │       ├── SplashPage.tsx
│   │       ├── LoginPage.tsx
│   │       ├── ProjectsPage.tsx
│   │       ├── ProjectDetailPage.tsx
│   │       └── AgentsPage.tsx
│
├── backend/                           # NestJS 11 API
│   ├── Dockerfile                     # 2-stage: NestJS build → node:22 + python3 + pip
│   ├── entrypoint.sh                  # Enable pgvector → prisma db push → node dist/src/main.js
│   ├── package.json                   # NestJS 11, Prisma 7.8, class-validator, rxjs
│   ├── prisma/
│   │   ├── schema.prisma              # 6 models, pgvector Unsupported("vector(3072)")
│   │   ├── seed.ts                    # CREATE EXTENSION vector
│   │   └── pgvector.sql               # CREATE EXTENSION IF NOT EXISTS vector
│   └── src/
│       ├── main.ts                    # Bootstrap: CORS, ValidationPipe, listen(:3000)
│       ├── app.module.ts              # Root module: ConfigModule, PrismaModule, Research, Monitoring, Scheduler
│       ├── modules/prisma/
│       │   ├── prisma.module.ts       # @Global PrismaModule
│       │   └── prisma.service.ts      # PrismaClient + PrismaPg adapter + pg Pool
│       ├── research/
│       │   ├── research.controller.ts # POST /pipeline, GET /runs/:id, @Sse /runs/:id/stream
│       │   ├── research.service.ts    # runPipeline, spawnWorker (NDJSON), handleWorkerLine
│       │   └── research.dto.ts        # RunPipelineDto (tenantId, businessDescription, name?, knownCompetitors?)
│       ├── monitoring/
│       │   ├── monitoring.controller.ts # POST /run, GET /tenant/:id, GET /tenant/:id/history
│       │   ├── monitoring.service.ts    # runMonitoring, spawnMonitoringWorker (single JSON)
│       │   └── monitoring.dto.ts        # RunMonitoringDto (tenantId, currentRunId)
│       └── scheduler/
│           └── scheduler.service.ts   # 15min pipeline loop + 24h monitoring loop (setInterval)
│
└── workers/                           # Python 3.12 AI engine
    ├── requirements.txt               # google-genai, tavily, psycopg2, pydantic, python-dotenv
    ├── main.py                        # Entry point: stdin → dispatch → stdout (91 lines)
    ├── config.py                      # Frozen dataclass Settings (env vars)
    ├── db.py                          # psycopg2 singleton: create_run, store_finding, get_findings_by_run,
    │                                  #   cosine_similarity, ensure_tenant
    ├── embeddings.py                  # gemini-embedding-2 (3072-dim) via google-genai
    ├── tools.py                       # Tavily web_search (advanced) + web_fetch
    ├── retry.py                       # generate_with_retry: 429 only, exp backoff (5s/10s/20s)
    ├── scraping/agent.py              # Market Intelligence Agent (122 lines)
    ├── analysis/agent.py              # Competitor Reconnaissance Agent (173 lines)
    ├── strategy/agent.py              # Strategy Generation Agent (242 lines)
    ├── monitoring/agent.py            # Change Detection Agent (402 lines)
    └── tests/                         # Manual test scripts + fixture JSON files
```

### 15.2 Environment Variables

#### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (`postgresql://user:pass@host:port/db`) |
| `PORT` | No | `3000` | Server listen port |
| `FRONTEND_URL` | No | `http://localhost:5173` | CORS allowed origin |
| `MONITORING_INTERVAL_MS` | No | `86400000` (24h) | How far ahead to set `tenant.nextRunAt` after each monitoring run |

#### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE_URL` | No | `""` (relative) | Backend API base URL. Empty string = use Vite proxy in dev, nginx proxy in prod. |

#### Workers (`workers/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | Same PostgreSQL connection string as backend |
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key for LLM calls |
| `GEMINI_EMBEDDING_API_KEY` | No | `GEMINI_API_KEY` | Separate key for embedding generation (quota isolation) |
| `TAVILY_API_KEY` | Yes | — | Tavily search API key |
| `PIPELINE_TIMEOUT` | No | `120` | **Defined but never consumed** — dead configuration |

### 15.3 Glossary

| Term | Definition |
|------|-----------|
| **C4 Model** | Simon Brown's software architecture model: Context → Container → Component → Code. Each level zooms in one layer. |
| **NDJSON** | Newline-delimited JSON. Each line is an independent JSON object. Used for streaming structured data over stdout. |
| **SSE** | Server-Sent Events. A standard for unidirectional server→client streaming over HTTP. Simpler than WebSocket for one-way push. |
| **pgvector** | PostgreSQL extension for vector similarity search. Supports L2, inner product, and cosine distance. |
| **HNSW** | Hierarchical Navigable Small World. An approximate nearest-neighbor algorithm supported by pgvector for fast vector search. |
| **Pydantic** | Python data-validation library using type annotations. Used to validate LLM output before storage. |
| **`response_schema`** | Gemini API parameter that forces the model to return JSON conforming to a given schema. Used by the strategy agent. |
| **`generate_with_retry`** | Custom retry wrapper in `workers/retry.py` that catches HTTP 429 (rate limit) and applies exponential backoff. |
| **`child_process.spawn()`** | Node.js API for launching a new OS process. Used by the backend to run Python workers. |
| **Prisma** | Node.js ORM for PostgreSQL. Prisma 7.8 is used in this project with the `prisma-client` generator. |
| **PrismaPg** | A connection pool adapter for Prisma that uses `pg.Pool` instead of the built-in binary engine. |

---

*Document version: 1.0 · Last updated: July 2026*
