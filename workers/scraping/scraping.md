# Phase 2 — Parallel Research Agents

## Architecture Overview

```
NestJS API (POST /api/research/pipeline)
  └─ spawns Python pipeline runner
       ├─ Agent 1a: Market Intelligence (Gemini + Tavily)
       └─ Agent 1b: Competitor Recon (Gemini + Tavily)
  ── both store findings → PostgreSQL + pgvector (with embeddings)
```

## Tech Choices

| Component | Choice |
|-----------|--------|
| Agents | Python `workers/` directory |
| LLM | Google Gemini |
| Web search | Tavily |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) |
| Database | PostgreSQL + pgvector (Docker) |
| Backend comms | Child process (stdin/stdout JSON) |

---

## Files Created (15 new)

| File | Purpose |
|------|---------|
| `docker-compose.yml` | PostgreSQL 16 + pgvector container |
| `.env.example` | API keys template |
| `.gitignore` | Excludes `.env`, `node_modules`, `__pycache__` |
| `init-db/001_init.sql` | Schema: `tenants`, `research_runs`, `findings` (with `VECTOR(1536)`) |
| `workers/db.py` | PostgreSQL CRUD: `create_run`, `update_run`, `store_finding`, `ensure_tenant` |
| `workers/embeddings.py` | `get_embedding()` via OpenAI `text-embedding-3-small` |
| `workers/tools.py` | `web_search()` + `web_fetch()` via Tavily |
| `workers/scraping/agent.py` | **Agent 1a** — Market Intelligence (Gemini + Tavily) |
| `workers/analysis/agent.py` | **Agent 1b** — Competitor Recon (Gemini + Tavily) |
| `backend/src/research/research.service.ts` | Spawns Python pipeline, tracks run status |
| `backend/src/research/research.controller.ts` | `POST /api/research/pipeline`, `GET /api/research/runs/:id` |
| `backend/src/research/research.module.ts` | Wires research module |
| `backend/src/research/research.dto.ts` | Request validation with class-validator |
| `backend/src/database/entities/tenant.entity.ts` | Tenant entity |
| `backend/src/database/entities/research-run.entity.ts` | ResearchRun entity |
| `backend/src/database/entities/finding.entity.ts` | Finding entity (with JSONB content + vector embedding) |

## Files Modified (5)

| File | Change |
|------|--------|
| `workers/config.py` | Settings dataclass loading all env vars |
| `workers/main.py` | Pipeline runner: `asyncio.gather()` for parallel agents, timeout handling |
| `workers/requirements.txt` | All Python deps |
| `backend/package.json` | Added `@nestjs/typeorm`, `typeorm`, `pg`, `class-validator`, `class-transformer` |
| `backend/src/app.module.ts` | Added `TypeOrmModule.forRoot()` + `ResearchModule` import |

---

## Database Schema

### `tenants`
| Column | Type |
|--------|------|
| `id` | UUID PK |
| `business_description` | TEXT |
| `created_at` | TIMESTAMPTZ |

### `research_runs`
| Column | Type |
|--------|------|
| `id` | UUID PK |
| `tenant_id` | UUID FK → tenants |
| `status` | ENUM (pending, running, completed, failed) |
| `started_at` | TIMESTAMPTZ |
| `completed_at` | TIMESTAMPTZ |
| `created_at` | TIMESTAMPTZ |

### `findings`
| Column | Type |
|--------|------|
| `id` | UUID PK |
| `tenant_id` | UUID FK → tenants |
| `run_id` | UUID FK → research_runs |
| `agent_type` | ENUM (market_intel, competitor_recon) |
| `content` | JSONB |
| `embedding` | VECTOR(1536) |
| `created_at` | TIMESTAMPTZ |

---

## Agent 1a — Market Intelligence

**File:** `workers/scraping/agent.py`

**Input:** `{ tenant_id, business_description }`

**Flow:**
1. Generates 5 search queries from business description
2. Runs Tavily web search for each (3 results each)
3. Fetches top 3 URLs for deeper content extraction
4. Sends all context to Gemini 2.0 Flash for synthesis
5. Validates output with Pydantic (`MarketIntelOutput`)
6. Generates embedding of full JSON
7. Stores in `findings` table with `agent_type = 'market_intel'`

**Output schema:**
```json
{
  "industry_summary": "string",
  "market_trends": ["string", "..."],
  "typical_pricing_models": ["string", "..."],
  "common_customer_pain_points": ["string", "..."],
  "sources": ["url", "..."]
}
```

---

## Agent 1b — Competitor Recon

**File:** `workers/analysis/agent.py`

**Input:** `{ tenant_id, business_description, known_competitors: ["name", ...] }`

**Flow:**
1. If `known_competitors` is empty → searches for competitors, asks Gemini to extract top 3-5 names
2. For each competitor, runs 4 targeted searches (pricing, reviews, news, features)
3. Fetches top 2 URLs per competitor for deeper extraction
4. Sends all context to Gemini 2.0 Flash for per-competitor synthesis
5. Validates output with Pydantic (`CompetitorReconOutput`)
6. Generates embedding of full JSON
7. Stores in `findings` table with `agent_type = 'competitor_recon'`

**Output schema:**
```json
{
  "competitors": [
    {
      "name": "string",
      "pricing_notes": "string",
      "positioning": "string",
      "recent_activity": ["string", "..."],
      "review_sentiment_summary": "string",
      "sources": ["url", "..."]
    }
  ]
}
```

---

## Pipeline Runner

**File:** `workers/main.py`

- Accepts input via stdin JSON: `{ tenant_id, business_description, known_competitors }`
- Creates a `research_runs` record with status `running`
- Launches Agent 1a and Agent 1b **in parallel** using `asyncio.gather()`
- Waits for both to complete (120s default timeout, configurable via `PIPELINE_TIMEOUT`)
- On success: updates run status to `completed`
- On failure/timeout: updates run status to `failed`, stores partial results
- Outputs the combined JSON result to stdout

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/research/pipeline` | Start a research pipeline run |
| `GET` | `/api/research/runs/:runId` | Get run status |
| `GET` | `/api/research/runs/:runId/findings` | Get findings for a specific run |
| `GET` | `/api/research/tenants/:tenantId/findings` | Get all findings for a tenant |

---

## How to Run

```bash
# 1. Set up environment
cp .env.example .env
# Fill in API keys

# 2. Start PostgreSQL + pgvector
docker-compose up -d

# 3. Install Python deps
cd workers
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 4. Install backend deps
cd ../backend
pnpm install

# 5. Start backend
pnpm run start:dev
```

### Test the pipeline

```bash
curl -X POST http://localhost:3000/api/research/pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "some-uuid",
    "businessDescription": "AI-powered customer support SaaS",
    "knownCompetitors": []
  }'
```

---

## Key Design Decisions

- **Parallel execution:** `asyncio.gather()` in Python runs both agents concurrently
- **Timeout:** 120s default, configurable via env var; partial results saved on timeout
- **Embeddings stored with findings:** Each finding row gets a `VECTOR(1536)` column for future similarity search
- **Pipeline status tracking:** `research_runs` table tracks each invocation (pending → running → completed/failed)
- **Schema validation:** Pydantic models validate agent output before DB storage
- **Error isolation:** If one agent fails, the other's results are still saved
