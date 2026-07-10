# Phase 5 — Monitoring Agent

## Overview

The monitoring agent compares the current pipeline run's output against the previous run for the same tenant, detects significant changes, and produces a summary that feeds into human validation (Phase 6).

It uses a **two-layer approach**:

1. **Rule-based comparison** — fast, deterministic delta computation on KPIs, competitor lists, pricing, trends, pain points, sentiment, and strategy output.
2. **LLM explanation** — only triggered when rule-based comparison detects significant changes. Invokes Gemini to explain the business impact and produce a human-actionable `concept_for_validation`.

## Input

The agent receives two data dictionaries:

- `current_run_data` — step outputs from the latest completed pipeline run (market_intelligence, competitor_recon, strategy_output)
- `previous_run_data` — same structure from the previous completed run (or `None` on first run)
- `tenant_id` — the tenant UUID

### Input data flattening

Raw step outputs are flattened before comparison:

| Step | Keys extracted |
|------|---------------|
| `market_intelligence` | `market_trends`, `pricing_models` (from `typical_pricing_models`), `customer_pain_points` (from `common_customer_pain_points`) |
| `competitor_recon` | `competitor_names`, `pricing_models` (from `pricing_notes`), `positioning` |
| `strategy_output` | Entire dict compared field-by-field |

## Output Schema

```json
{
  "significant_change_detected": true,
  "changes": ["New competitor: 'Foo'", "Market size increased from 1000000 to 5000000 (400% change)"],
  "alert_message": "String or null — LLM-generated summary of what changed and why it matters",
  "concept_for_validation": "String — specific recommendation that needs human judgment, feeds Phase 6"
}
```

## Significance Detection

A change is flagged as **significant** (triggers LLM explanation) if any of:

| Condition | Threshold |
|-----------|-----------|
| New or removed competitor | Any change |
| New or removed market trend | Any change |
| New or removed customer pain point | Any change |
| Market size change | > 10% |
| Growth rate change | > 10% |
| Average sentiment change | > 10% |
| Strategy output field changed | Any change |

The 10% threshold is a global constant `SIGNIFICANT_THRESHOLD = 0.10` in `workers/monitoring/agent.py`.

## LLM Usage

- **Model:** `gemini-3-flash-preview` via `google.generativeai`
- **When:** Only when `significant_change_detected == true` AND deltas exist
- **Prompt:** Sends current data, previous data, and detected deltas
- **Response:** Parsed as JSON -> `alert_message` + `concept_for_validation`
- **Fallback:** If LLM call fails, a hardcoded message lists the raw deltas

## First Run Behavior

When `previous_run_data` is `None` (no prior run exists):

```json
{
  "significant_change_detected": true,
  "changes": ["First run — no previous data to compare"],
  "alert_message": "Initial research run completed. Baseline established.",
  "concept_for_validation": "Review initial findings and confirm business description accuracy."
}
```

## Scheduling

Two intervals managed via `setInterval` in `SchedulerService.onModuleInit()`:

| Interval | Purpose |
|----------|---------|
| 15 minutes | Check tenants where `nextRunAt <= now`, trigger pipeline |
| 24 hours | Run monitoring for all tenants with completed runs |

**Cycle flow:**
1. Pipeline scheduler picks up due tenants -> creates `PipelineRun` -> spawns Python worker -> saves `PipelineStep` records -> marks run completed
2. Monitoring cron finds latest completed run per tenant -> compares with previous -> saves `MonitoringResult` -> sets `tenant.nextRunAt = now + interval`
3. Next pipeline run happens when `nextRunAt` is reached

The monitoring agent does **not** directly trigger the next pipeline run. It sets `nextRunAt`, and the 15-minute scheduler picks it up.

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/monitoring/run` | Manual trigger with `{ tenantId, currentRunId }` |
| GET | `/api/monitoring/tenant/:tenantId` | Latest monitoring result |
| GET | `/api/monitoring/tenant/:tenantId/history` | All results for a tenant |

## Pipeline Agent Outputs (what monitoring compares)

### scraping/agent.py
```json
{
  "industry_summary": "string",
  "market_trends": ["string", "..."],
  "typical_pricing_models": ["string", "..."],
  "common_customer_pain_points": ["string", "..."],
  "sources": ["url", "..."]
}
```

### analysis/agent.py
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

### strategy/agent.py
```json
{
  "positioning": "string",
  "messaging": "string",
  "pricing_recommendation": "string",
  "recommended_actions": ["string", "..."]
}
```

## Files

| File | Role |
|------|------|
| `workers/monitoring/agent.py` | Core comparison logic + LLM explanation |
| `workers/main.py` | Entry point — routes `mode: "monitoring"` to the agent |
| `workers/config.py` | Settings (Gemini, Tavily, OpenAI keys from env) |
| `workers/db.py` | Direct PostgreSQL access for pipeline runs |
| `backend/src/prisma.service.ts` | Prisma client wrapper |
| `backend/src/monitoring/monitoring.service.ts` | Orchestrates: fetches runs, spawns worker, saves result |
| `backend/src/monitoring/monitoring.controller.ts` | REST endpoints |
| `backend/src/monitoring/monitoring.dto.ts` | DTOs for request/response |
| `backend/src/scheduler/scheduler.service.ts` | Cron jobs for pipeline + monitoring |
