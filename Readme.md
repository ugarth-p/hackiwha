# Brand Market Tracker - Hackiwha 3.0

An autonomous competitive intelligence platform built for **Theme 2: Marketing & Branding**. The system digests market landscape data, tracks competitor movements, analyzes consumer sentiment, and generates actionable branding strategies using a multi-agent AI pipeline.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [AI Agent Pipeline](#ai-agent-pipeline)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)

---

## System Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                            │
│                                                                      │
│   React 19 + Vite 8 + TypeScript 6 + ReactFlow + Zustand            │
│   Pages: Splash, Login, Projects, Project Detail, Agent Pipeline     │
└─────────────────────────────┬────────────────────────────────────────┘
                              │  HTTP / SSE
                              │  (Vite proxy: /api → :3000)
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     BACKEND (NestJS 11 :3000)                        │
│                                                                      │
│   ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐    │
│   │  Research    │  │  Monitoring  │  │  Scheduler              │    │
│   │  Controller  │  │  Controller  │  │  (15min pipeline,       │    │
│   │  + Service   │  │  + Service   │  │   24h monitoring)       │    │
│   └──────┬──────┘  └──────┬───────┘  └────────┬────────────────┘    │
│          │                │                    │                      │
│          └────────────────┼────────────────────┘                     │
│                           │  child_process.spawn()                   │
│                           │  stdin: JSON → stdout: JSON              │
└───────────────────────────┼──────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    WORKERS (Python 3.12)                              │
│                                                                      │
│   ┌───────────────┐  ┌────────────────┐  ┌──────────────────────┐   │
│   │  Scraping     │  │  Analysis      │  │  Strategy            │   │
│   │  Agent        │  │  Agent         │  │  Agent               │   │
│   │  (Tavily +    │  │  (Gemini +     │  │  (Gemini)            │   │
│   │   Gemini)     │  │   Tavily)      │  │                      │   │
│   └───────┬───────┘  └───────┬────────┘  └──────────┬───────────┘   │
│           │                  │                       │                │
│           └──────────────────┼───────────────────────┘                │
│                              │                                        │
│   ┌──────────────────────────┐                                        │
│   │  Monitoring Agent        │  (compares two runs, detects changes)  │
│   │  (Gemini + rule-based)   │                                        │
│   └──────────────────────────┘                                        │
│                                                                      │
│   Tools: db.py (psycopg2), embeddings.py (Gemini), tools.py (Tavily) │
└──────────────────────────────┬────────────────────────────────────────┘
                               │  psycopg2 (direct SQL)
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  PostgreSQL 16 + pgvector (:5432)                    │
│                                                                      │
│   Tenant │ PipelineRun │ PipelineStep │ Finding │ MonitoringResult    │
│          │             │              │ (vector embeddings)          │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. User clicks "Launch Sequence" in the React frontend
2. Frontend POST /api/research/pipeline { tenantId, businessDescription }
3. Backend creates PipelineRun (status=running), spawns Python worker
4. Worker runs sequentially:
   a. scraping.agent  → Tavily web search → Gemini synthesis → store Finding
   b. analysis.agent  → Tavily search → Gemini synthesis   → store Finding
   c. strategy.agent  → Gemini strategy generation
5. Worker prints JSON to stdout → Backend saves PipelineSteps
6. Backend emits SSE events (step_completed, run_completed)
7. Frontend receives SSE → updates pipeline visualization in real-time
8. AgentNode panels display actual research findings
```

### Real-Time Communication (SSE)

The backend exposes a Server-Sent Events endpoint at `GET /api/research/runs/:runId/stream`. When a pipeline run completes a step or finishes, the backend emits events that the frontend consumes to update the pipeline visualization without polling.

**Event types:**
| Event | Payload | When |
|-------|---------|------|
| `step_completed` | `{ stepName, output }` | Each agent finishes |
| `run_completed` | `{}` | Entire pipeline done |
| `run_failed` | `{ error }` | Pipeline or worker error |

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React | 19.2.6 |
| | Vite | 8.x |
| | TypeScript | ~6.0 |
| | Tailwind CSS | 4.x |
| | ReactFlow | 12.x |
| | Zustand | 5.x |
| | TanStack Query | 5.x |
| | Framer Motion | 12.x |
| **Backend** | NestJS | 11.x |
| | Prisma | 7.8 |
| | class-validator | 0.14 |
| | rxjs (SSE) | 7.x |
| **Workers** | Python | 3.12 |
| | Google Gemini | gemini-3-flash-preview |
| | Tavily | Search + Extract |
| | psycopg2 | PostgreSQL driver |
| | Pydantic | Output validation |
| **Database** | PostgreSQL | 16 |
| | pgvector | Vector embeddings (3072-dim) |
| **Infra** | Docker | Multi-stage builds |
| | nginx | SPA + API reverse proxy |

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────────┐
│       Tenant         │
├─────────────────────┤
│ id          UUID PK │
│ name        String  │
│ businessDescription?│
│ nextRunAt?  Timestamptz
│ createdAt   Timestamptz
└─────────┬───────────┘
          │
          │ 1:N
          │
    ┌─────┼──────────────────────────────┐
    │     │                              │
    ▼     ▼                              ▼
┌──────────────────┐           ┌──────────────────┐
│   PipelineRun    │           │    Finding        │
├──────────────────┤           ├──────────────────┤
│ id       UUID PK │           │ id        UUID PK│
│ tenantId UUID FK │           │ tenantId  UUID FK│
│ status   String  │           │ runId?    UUID   │
│ triggeredBy      │           │ source    String │
│ startedAt        │           │ content   String │
│ completedAt?     │           │ embedding vector │
└────────┬─────────┘           │   (3072 dims)    │
         │                     │ createdAt        │
         │ 1:N                 └──────────────────┘
         ▼
┌──────────────────────┐      ┌─────────────────────────┐
│    PipelineStep      │      │   MonitoringResult      │
├──────────────────────┤      ├─────────────────────────┤
│ id          UUID PK  │      │ id               UUID PK│
│ runId       UUID FK  │      │ tenantId         UUID FK│
│ stepName    String   │      │ currentRunId     UUID   │
│ status      String   │      │ previousRunId?   UUID   │
│ inputJson?  JSON     │      │ significantChange Boolean│
│ outputJson? JSON     │      │ changes          JSON   │
│ errorText?  String   │      │ alertMessage?    String │
│ startedAt?  DateTime │      │ conceptForValidation?    │
│ completedAt?DateTime │      │ createdAt        DateTime│
└──────────────────────┘      └─────────────────────────┘

┌──────────────────┐
│     Persona      │  (reserved for future use)
├──────────────────┤
│ id       UUID PK │
│ tenantId UUID FK │
│ name     String  │
│ systemPrompt     │
│ isDefault Bool   │
└──────────────────┘
```

### Table Definitions

#### `Tenant`
Multi-tenant root entity. Each tenant represents a brand/business being tracked.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Tenant identifier |
| `name` | String | NOT NULL | Display name |
| `businessDescription` | String | Nullable | Description of the business for AI agents |
| `nextRunAt` | Timestamptz | Nullable | When the scheduler should next run a pipeline |
| `createdAt` | Timestamptz | Default `now()` | Creation timestamp |

#### `PipelineRun`
Tracks each execution of the research pipeline.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Run identifier |
| `tenantId` | UUID | FK → Tenant, CASCADE | Owning tenant |
| `status` | String | Default `"running"` | `running` \| `completed` \| `failed` |
| `triggeredBy` | String | NOT NULL | `manual` \| `schedule` |
| `startedAt` | Timestamptz | Default `now()` | Run start time |
| `completedAt` | Timestamptz | Nullable | Run completion time |

#### `PipelineStep`
Individual step within a pipeline run. Each agent produces one step.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Step identifier |
| `runId` | UUID | FK → PipelineRun, CASCADE | Parent run |
| `stepName` | String | NOT NULL | `market_intelligence` \| `competitor_recon` \| `strategy_output` |
| `status` | String | Default `"pending"` | `pending` \| `running` \| `completed` \| `failed` |
| `inputJson` | JSON | Nullable | Step input (reserved) |
| `outputJson` | JSON | Nullable | Agent output (structured research data) |
| `errorText` | String | Nullable | Error message on failure |
| `startedAt` | Timestamptz | Nullable | Step start time |
| `completedAt` | Timestamptz | Nullable | Step completion time |

#### `Finding`
Research findings stored with pgvector embeddings for semantic search.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Finding identifier |
| `tenantId` | UUID | FK → Tenant, CASCADE | Owning tenant |
| `runId` | UUID | Nullable | Source pipeline run |
| `source` | String | NOT NULL | `market_intel` \| `competitor_recon` |
| `content` | String | NOT NULL | JSON-serialized agent output |
| `embedding` | vector(3072) | Nullable | Gemini embedding for semantic search |
| `createdAt` | Timestamptz | Default `now()` | Creation timestamp |

#### `MonitoringResult`
Stores change detection results between pipeline runs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Result identifier |
| `tenantId` | UUID | FK → Tenant, CASCADE | Owning tenant |
| `currentRunId` | UUID | NOT NULL | Latest run being compared |
| `previousRunId` | UUID | Nullable | Previous run (null on first run) |
| `significantChangeDetected` | Boolean | Default `false` | Whether changes were found |
| `changes` | JSON | NOT NULL | Detailed change list |
| `alertMessage` | String | Nullable | Human-readable alert |
| `conceptForValidation` | String | Nullable | Concept needing human review |
| `createdAt` | Timestamptz | Default `now()` | Creation timestamp |

#### `Persona`
Reserved for future multi-persona AI evaluation (currently unused in code).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Persona identifier |
| `tenantId` | UUID | FK → Tenant, CASCADE | Owning tenant |
| `name` | String | NOT NULL | Persona name |
| `systemPrompt` | String | NOT NULL | LLM system prompt |
| `isDefault` | Boolean | Default `true` | Whether this is the default persona |

---

## API Reference

### Research Endpoints

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| `POST` | `/api/research/pipeline` | Trigger a pipeline run | `{ tenantId, businessDescription, name?, knownCompetitors? }` | `202 { runId, status }` |
| `GET` | `/api/research/runs/:runId` | Get run details with steps | — | `PipelineRun` with `steps[]` |
| `GET` | `/api/research/runs/:runId/findings` | Get findings for a run | — | `Finding[]` |
| `GET` | `/api/research/tenants/:tenantId/findings` | Get all findings for a tenant | — | `Finding[]` |
| `GET` | `/api/research/runs/:runId/stream` | SSE stream of pipeline events | — | `EventSource` |

### Monitoring Endpoints

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| `POST` | `/api/monitoring/run` | Trigger monitoring comparison | `{ tenantId, currentRunId }` | `202 MonitoringResult` |
| `GET` | `/api/monitoring/tenant/:tenantId` | Get latest monitoring result | — | `MonitoringResult` |
| `GET` | `/api/monitoring/tenant/:tenantId/history` | Get monitoring history | — | `MonitoringResult[]` |

### Health Check

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/` | Health check | `"Hello World!"` |

### Request/Response Examples

**Trigger Pipeline:**
```bash
curl -X POST http://localhost:3000/api/research/pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "my-brand",
    "businessDescription": "AI-powered fitness coaching app",
    "knownCompetitors": ["Peloton", "Fitbod"]
  }'
```

**Response:**
```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running"
}
```

**SSE Stream:**
```bash
curl -N http://localhost:3000/api/research/runs/550e8400-e29b-41d4-a716-446655440000/stream
```

```
data: {"type":"step_completed","runId":"550e8400...","stepName":"market_intelligence","output":{...}}

data: {"type":"step_completed","runId":"550e8400...","stepName":"competitor_recon","output":{...}}

data: {"type":"step_completed","runId":"550e8400...","stepName":"strategy_output","output":{...}}

data: {"type":"run_completed","runId":"550e8400..."}
```

---

## AI Agent Pipeline

The pipeline runs three agents sequentially, followed by an optional monitoring comparison.

### Agent 1: Market Intelligence (`scraping/agent.py`)

**Purpose:** Researches the general market landscape for the given business.

**Process:**
1. Runs 3 Tavily web searches (industry size, pricing models, pain points)
2. Fetches raw content from top 3 URLs
3. Sends all context to Gemini with a structured prompt
4. Validates output against `MarketIntelOutput` Pydantic model
5. Generates a vector embedding and stores the Finding in PostgreSQL

**Output schema:**
```json
{
  "industry_summary": "string",
  "market_trends": ["string"],
  "typical_pricing_models": ["string"],
  "common_customer_pain_points": ["string"],
  "sources": ["url"]
}
```

### Agent 2: Competitor Reconnaissance (`analysis/agent.py`)

**Purpose:** Discovers and researches specific named competitors.

**Process:**
1. Auto-discovers 3-5 competitors via Tavily search + Gemini extraction
2. For each competitor: searches pricing and reviews
3. Fetches raw content from top URLs per competitor
4. Synthesizes structured competitor intel via Gemini
5. Validates against `CompetitorOutput` Pydantic model
6. Generates embedding and stores Finding

**Output schema:**
```json
{
  "competitors": [
    {
      "name": "string",
      "pricing_notes": "string",
      "positioning": "string",
      "recent_activity": ["string"],
      "review_sentiment_summary": "string",
      "sources": ["url"]
    }
  ]
}
```

### Agent 3: Strategy Generation (`strategy/agent.py`)

**Purpose:** Generates an actionable marketing strategy from the research.

**Process:**
1. Takes market intelligence + competitor recon as context
2. Sends to Gemini with a strategy-focused system prompt
3. Returns structured strategy (no DB storage, no embedding)

**Output schema:**
```json
{
  "positioning": "string",
  "messaging": "string",
  "pricing_recommendation": "string",
  "recommended_actions": ["string"]
}
```

### Monitoring Agent (`monitoring/agent.py`)

**Purpose:** Compares two pipeline runs and detects meaningful changes.

**Process:**
1. Performs rule-based comparison across 7 dimensions (competitors, pricing, trends, pain points, market size, growth rate, sentiment)
2. If significant changes detected, calls Gemini for business impact analysis
3. Returns structured change report

**Output schema:**
```json
{
  "significant_change_detected": true,
  "changes": ["string"],
  "alert_message": "string",
  "concept_for_validation": "string"
}
```

### External API Dependencies

| API | Used By | Purpose |
|-----|---------|---------|
| Google Gemini (`gemini-3-flash-preview`) | All agents | LLM reasoning and synthesis |
| Google Gemini Embeddings (`gemini-embedding-2`) | Scraping + Analysis agents | Vector embeddings for semantic search |
| Tavily | Scraping + Analysis agents | Web search and content extraction |
| PostgreSQL + pgvector | All agents (via `db.py`) | Data persistence and vector storage |

---

## Project Structure

```
hackiwha/
├── Readme.md                          # This file
├── docker-compose.yml                 # Full stack orchestration
├── .env.example                       # Root env template
│
├── frontend/                          # React SPA
│   ├── Dockerfile                     # Multi-stage: build + nginx
│   ├── nginx.conf                     # SPA routing + /api proxy
│   ├── .dockerignore
│   ├── vite.config.ts                 # Vite config with /api proxy
│   ├── package.json
│   └── src/
│       ├── main.tsx                   # Entry point
│       ├── App.tsx                    # Route definitions
│       ├── types/api.ts               # TypeScript types for API
│       ├── services/api.ts            # API client
│       ├── hooks/usePipeline.ts       # React Query hooks
│       ├── hooks/useMonitoring.ts     # React Query hooks
│       ├── providers/query-provider.tsx
│       ├── stores/auth.ts             # Zustand auth store
│       ├── stores/projects.ts         # Zustand projects store
│       ├── components/AgentPipeline.tsx  # Core pipeline visualization
│       ├── components/AgentNode.tsx      # ReactFlow node component
│       └── pages/                     # Page components
│
├── backend/                           # NestJS API
│   ├── Dockerfile                     # Multi-stage: Node.js + Python
│   ├── .dockerignore
│   ├── prisma/schema.prisma           # Database schema
│   ├── prisma/seed.ts                 # pgvector extension setup
│   └── src/
│       ├── main.ts                    # Entry point (CORS, ValidationPipe)
│       ├── app.module.ts              # Root module
│       ├── modules/prisma/            # Global PrismaService
│       ├── research/                  # Pipeline trigger + SSE streaming
│       ├── monitoring/                # Change detection endpoints
│       └── scheduler/                 # Cron-like task scheduling
│
├── workers/                           # Python AI engine
│   ├── .env.example
│   ├── requirements.txt
│   ├── main.py                        # Entry point (stdin → dispatch → stdout)
│   ├── config.py                      # Environment configuration
│   ├── db.py                          # PostgreSQL access (psycopg2)
│   ├── embeddings.py                  # Gemini embedding generation
│   ├── tools.py                       # Tavily web search/extract
│   ├── retry.py                       # Gemini retry with backoff
│   ├── scraping/agent.py              # Market Intelligence Agent
│   ├── analysis/agent.py              # Competitor Reconnaissance Agent
│   ├── strategy/agent.py              # Strategy Generation Agent
│   ├── monitoring/agent.py            # Change Detection Agent
│   └── strategy_analyst/              # Standalone FastAPI sub-service
│
└── my-project/                        # (unused scaffold)
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- Python 3.10+
- Docker & Docker Compose v2+
- PostgreSQL 16+ (or use Docker)

### Option A: Docker (Recommended)

```bash
# 1. Clone and configure
git clone <repo-url> && cd hackiwha
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp workers/.env.example workers/.env

# 2. Set API keys in backend/.env
#    GEMINI_API_KEY=your-key
#    GEMINI_EMBEDDING_API_KEY=your-key
#    TAVILY_API_KEY=your-key

# 3. Start everything
docker compose up --build

# 4. Open in browser
#    Frontend: http://localhost
#    Backend:  http://localhost:3000
```

### Option B: Local Development

```bash
# 1. Start PostgreSQL (Docker)
docker compose up -d postgres

# 2. Backend
cd backend
cp .env.example .env          # Configure DATABASE_URL and API keys
pnpm install
npx prisma generate
npx prisma db push
pnpm run seed                 # Enable pgvector extension
pnpm start:dev                # http://localhost:3000

# 3. Workers
cd ../workers
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Ensure .env has DATABASE_URL, GEMINI_API_KEY, GEMINI_EMBEDDING_API_KEY, TAVILY_API_KEY

# 4. Frontend (new terminal)
cd frontend
pnpm install
pnpm dev                      # http://localhost:5173
```

### Database Setup

The database is automatically configured via Docker Compose. For manual setup:

```bash
# Create database
createdb -U hackiwha hackiwha

# Enable pgvector extension
psql -U hackiwha -d hackiwha -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Push Prisma schema
cd backend
npx prisma db push
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `PORT` | No | `3000` | Server port |
| `FRONTEND_URL` | No | `http://localhost:5173` | CORS origin |
| `MONITORING_INTERVAL_MS` | No | `86400000` (24h) | How often scheduler checks for due tenants |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE_URL` | No | `""` (relative) | Backend API base URL. Empty string uses Vite proxy in dev. |

### Workers (`workers/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | Same PostgreSQL connection as backend |
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key for LLM calls |
| `GEMINI_EMBEDDING_API_KEY` | Yes | — | Google Gemini API key for embedding generation |
| `TAVILY_API_KEY` | Yes | — | Tavily search API key |
| `PIPELINE_TIMEOUT` | No | `120` | Pipeline timeout in seconds (not enforced) |

---

## Deployment

### Docker Compose Services

```yaml
services:
  postgres:    # PostgreSQL 16 + pgvector
    image: pgvector/pgvector:pg16
    port: 5432

  backend:     # NestJS + Python workers (multi-stage build)
    build: backend/Dockerfile
    port: 3000
    depends_on: postgres

  frontend:    # React SPA served via nginx
    build: frontend/Dockerfile
    port: 80
    depends_on: backend
```

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Workers inside backend container | Backend spawns them via `child_process.spawn()`. Co-locating avoids IPC changes. |
| nginx for frontend | Handles SPA routing (`try_files`) and reverse-proxies `/api` to backend. |
| pgvector for embeddings | Native PostgreSQL extension, no separate vector DB needed. |
| SSE over WebSocket | Simpler implementation, sufficient for unidirectional server→client updates. |
| stdin/stdout for worker IPC | Lightweight, no HTTP server in workers, works with `child_process.spawn()`. |

### Production Considerations

- **Scaling workers:** Currently synchronous and single-threaded. For high throughput, consider a message queue (Redis/BullMQ) and worker pool.
- **Authentication:** No auth is implemented. Add JWT/OAuth before production deployment.
- **Rate limiting:** No rate limiting on API endpoints. Add throttling for public exposure.
- **Monitoring:** Add health check endpoints and Prometheus metrics.
- **Logging:** NestJS Logger is used throughout. Consider structured logging (e.g., Pino).
- **Secrets:** Use Docker secrets or a vault for API keys in production. Never commit `.env` files.
