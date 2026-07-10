# Phase 5 — Monitoring Agent

## Overview

The monitoring agent compares the current pipeline run's output against the previous run for the same tenant, detects significant changes, and produces a summary that feeds into human validation (Phase 6).

It uses a **two-layer approach**:

1. **Rule-based comparison** — fast, deterministic delta computation on KPIs, competitor lists, pricing, trends, pain points, sentiment, and strategy output.
2. **LLM explanation** — only triggered when rule-based comparison detects significant changes. Invokes Gemini to explain the business impact and produce a human-actionable `concept_for_validation`.

## Input

The agent receives two data dictionaries:

- `current_run_data` — flattened step outputs from the latest completed pipeline run (market_intelligence, competitor_recon, strategy_output)
- `previous_run_data` — same structure from the previous completed run (or `None` on first run)
- `tenant_id` — the tenant UUID (used for logging/context)

### Expected keys in each data dict

| Key | Type | Source Agent |
|-----|------|-------------|
| `competitor_names` | `list[str]` | scraping |
| `pricing_models` | `list[str]` | scraping |
| `market_trends` | `list[str]` | scraping |
| `customer_pain_points` | `list[str]` | scraping |
| `market_size` | `float` | scraping |
| `growth_rate` | `float` | scraping |
| `average_sentiment` | `float` | analysis |
| `strategy_output.positioning` | `str` | strategy |
| `strategy_output.messaging` | `str` | strategy |
| `strategy_output.pricing_recommendation` | `str` | strategy |
| `strategy_output.recommended_actions` | `list[str]` | strategy |

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

The 10% threshold is a global constant `SIGNIFICANT_THRESHOLD = 0.10` in `workers/monitoring/agent.py:12`.

## LLM Usage

- **Model:** `gemini-2.0-flash` via `google.generativeai`
- **When:** Only when `significant_change_detected == true` AND deltas exist
- **Prompt:** Sends current data, previous data, and detected deltas
- **Response:** Parsed as JSON → `alert_message` + `concept_for_validation`
- **Fallback:** If LLM call fails, a hardcoded message lists the raw deltas

## First Run Behavior

When `previous_run_data` is `None` (no prior run exists), the agent returns:

```json
{
  "significant_change_detected": true,
  "changes": ["First run — no previous data to compare"],
  "alert_message": "Initial research run completed. Baseline established.",
  "concept_for_validation": "Review initial findings and confirm business description accuracy."
}
```

## Scheduling

The monitoring agent is triggered by a **24-hour cron** in the backend scheduler (`SchedulerService.handleMonitoringRuns`):

1. Every 24h, the cron iterates over all tenants
2. For each tenant, finds the latest completed `PipelineRun`
3. Checks if monitoring already ran for that run (deduplication)
4. Calls `MonitoringService.runMonitoringForTenant(tenantId, runId)`
5. On completion, sets `tenant.nextRunAt = now + MONITORING_INTERVAL_MS`

This creates the cycle: **pipeline → monitoring → next_run_at → next pipeline**.

The monitoring agent does **not** directly trigger the next pipeline run. It sets `nextRunAt` on the tenant, and the existing 15-minute scheduler picks it up.

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/monitoring/run` | Manual trigger with `{ tenantId, currentRunId }` |
| GET | `/api/monitoring/tenant/:tenantId` | Latest monitoring result |
| GET | `/api/monitoring/tenant/:tenantId/history` | All results for a tenant |

## Files

| File | Role |
|------|------|
| `workers/monitoring/agent.py` | Core comparison logic + LLM explanation |
| `workers/config.py` | Settings (Gemini API key from env) |
| `workers/main.py` | Entry point — routes `mode: "monitoring"` to the agent |
| `backend/src/monitoring/monitoring.service.ts` | Orchestrates: fetches runs, spawns worker, saves result |
| `backend/src/monitoring/monitoring.controller.ts` | REST endpoints |
| `backend/src/monitoring/monitoring.dto.ts` | DTOs for request/response |
| `backend/src/scheduler/scheduler.service.ts` | Cron jobs for pipeline + monitoring |
