# Skill: Build the Competitive Intelligence Multi-Agent Pipeline

## Purpose

This document is a build specification for an agentic coding assistant. It describes a linear, multi-agent pipeline that researches a business's market and competitors, produces a strategy, monitors for change, and validates any resulting concept/strategy through a simulated persona panel. Follow the phases in order — each phase produces a working, testable slice before moving to the next. Do not attempt to build all agents at once.

---

## 1. System overview

The pipeline is a chain of single-purpose LLM agents. Each agent has one job, one system prompt, and a defined input/output schema. Agents hand off to the next agent by writing a JSON object to storage (a database row or queue message) — there is no shared memory or orchestrator deciding control flow beyond "run step N, then step N+1."

### 1.1 Full pipeline (in execution order)

```
[PARALLEL]
  Agent 1a: Market Intelligence Agent
  Agent 1b: Competitor Recon Agent
        |
        v  (join — wait for both)
Agent 2: Analysis Agent
        |
        v
Agent 3: Strategy Agent
        |
        v
Agent 4: Monitoring Agent  ---(on schedule)---> loops back to Agent 1a + 1b
        |
        v (produces a concept/strategy artifact to validate)
[PARALLEL, N agents]
  Agent 5.1..5.N: Persona Agents (Parent, Gen Z, Loyal fan, ...custom)
        |
        v (round 2+)
Agent 6: Panel Debate (personas re-respond to each other's round-1 output)
        |
        v
Agent 7: Moderator Agent
        |
        +--> Scoring Dashboard (data, not an agent — a computed view)
        +--> Agent 8: Report Generator
```

### 1.2 Design rules to follow throughout

- Every agent is a single LLM call (or a short bounded tool-use loop, max ~5 tool calls) with a **fixed input schema** and a **fixed output schema** (JSON). Never let an agent free-write prose as its final output — always force structured output so the next agent (or the UI) can consume it reliably.
- Agents never call each other directly. A pipeline runner (a simple script/worker) reads the output of step N from storage, and invokes step N+1 with it as input.
- Parallel steps (1a/1b, and the persona panel) must be joined with an explicit wait — do not let downstream steps start on partial results unless a timeout is hit (see error handling, section 8).
- Every agent's prompt should include the phrase "respond only with valid JSON matching this schema" plus the schema itself, to keep output parseable.

---

## 2. Tech stack (recommended, adjust to your team's preference)

- **Language**: Python (FastAPI for any API surface) or Node/TypeScript — pick whichever your team already knows; there's nothing in this design that requires one over the other.
- **LLM**: Claude via the Messages API, using tool use for the research agents (web search) and structured JSON output (via a JSON schema in the prompt, or Claude's tool-use forced JSON pattern) for every agent.
- **Orchestration**: a simple worker/queue setup is enough — this does NOT need Airflow or Temporal at this scale. Use:
  - A Postgres table `pipeline_runs` (one row per run, per tenant) to track state.
  - A Postgres table `pipeline_steps` (one row per agent invocation: run_id, step_name, input_json, output_json, status, created_at).
  - A simple cron (or a hosted scheduler like GitHub Actions cron, or a Temporal-lite tool like `apscheduler`) to kick off new runs on schedule.
- **Storage**: Postgres for structured data + pgvector extension for embeddings (used by the research agents to store/retrieve past findings). No need for a separate vector DB at this scale.
- **Frontend**: React dashboard reading from the same Postgres tables (via a thin API layer).

---

## 3. Data model

Create these tables first, before writing any agent code.

```sql
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_description text,
  created_at timestamptz default now()
);

create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  status text not null default 'running', -- running | completed | failed
  triggered_by text not null, -- 'schedule' | 'manual'
  started_at timestamptz default now(),
  completed_at timestamptz
);

create table pipeline_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references pipeline_runs(id),
  step_name text not null, -- 'market_intel' | 'competitor_recon' | 'analysis' | 'strategy' | 'monitoring' | 'persona_<name>' | 'panel_debate' | 'moderator' | 'report'
  status text not null default 'pending', -- pending | running | completed | failed
  input_json jsonb,
  output_json jsonb,
  error_text text,
  started_at timestamptz,
  completed_at timestamptz
);

create table personas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  name text not null, -- e.g. 'Budget-conscious parent'
  system_prompt text not null,
  is_default boolean default true
);

create table findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  source text not null, -- 'market_intel' | 'competitor_recon'
  content text not null,
  embedding vector(1536), -- requires pgvector
  created_at timestamptz default now()
);
```

---

## 4. Phase-by-phase build plan

### Phase 1 — Skeleton and data layer

1. Set up the Postgres schema above.
2. Build the `pipeline_runs` / `pipeline_steps` state machine: a function `run_step(run_id, step_name, input_json) -> output_json` that calls the right agent, records status, and handles failure (writes `error_text`, sets status to `failed`, halts the run).
3. Build a trivial "hello world" agent (echoes its input) wired through this state machine end to end, so you've proven the plumbing before writing real prompts.

### Phase 2 — Parallel research agents (1a, 1b)

**Agent 1a: Market Intelligence Agent**

- Input: `{ tenant_id, business_description }`
- Tools: web search
- System prompt directive: research the general market — industry size, growth trends, typical pricing models, common customer pain points, regulatory factors. Do NOT research named competitors here.
- Output schema:

```json
{
  "industry_summary": "string",
  "market_trends": ["string", "..."],
  "typical_pricing_models": ["string", "..."],
  "common_customer_pain_points": ["string", "..."],
  "sources": ["url", "..."]
}
```

**Agent 1b: Competitor Recon Agent**

- Input: `{ tenant_id, business_description, known_competitors: ["name", ...] }` (if `known_competitors` is empty, this agent's first tool call should be a search to identify likely competitors before going deep on each)
- Tools: web search, web fetch
- System prompt directive: for each competitor, gather pricing, positioning, recent launches, review sentiment (from review sites), social presence, and ad activity if discoverable (ad transparency libraries). Stay factual — cite what you found, don't speculate.
- Output schema:

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

- Both agents run as independent invocations. The pipeline runner starts both, waits for both `status = completed` (or a timeout — see section 8), then proceeds.
- Store each agent's raw findings in the `findings` table with embeddings, so future runs (and the analysis agent) can retrieve historical context via similarity search, not just the latest snapshot.

### Phase 3 — Analysis agent

- Input: outputs of 1a and 1b, plus (on 2nd+ runs) the previous run's analysis output for comparison.
- No tools required — pure reasoning over the two inputs.
- Directive: merge market context and competitor specifics into one structured competitive intelligence report. Explicitly call out opportunities (gaps competitors aren't covering) and threats (competitor moves that could hurt the tenant).
- Output schema:

```json
{
  "competitor_comparison": [
    { "name": "string", "strengths": ["string"], "weaknesses": ["string"] }
  ],
  "market_position_summary": "string",
  "opportunities": ["string", "..."],
  "threats": ["string", "..."],
  "changes_since_last_run": ["string", "..."]
}
```

### Phase 4 — Strategy agent

- Input: analysis agent's output + a static "pattern library" (a JSON or markdown file you maintain, listing known growth tactics: psychological pricing, premiumization, subscription conversion, etc. — seed this with 10–15 entries to start).
- Directive: recommend which patterns apply here and why, plus concrete pricing/marketing/roadmap recommendations. Ground every recommendation in a specific opportunity or threat from the analysis output — no generic advice.
- Output schema:

```json
{
  "recommended_patterns": [{ "pattern": "string", "why_it_applies": "string" }],
  "pricing_recommendation": "string",
  "marketing_recommendation": "string",
  "growth_roadmap": ["string", "..."],
  "kpi_targets": [{ "kpi": "string", "target": "string" }]
}
```

### Phase 5 — Monitoring agent

- Input: current run's analysis + strategy output, and the previous run's equivalent (fetch from `pipeline_steps` for the last completed run for this tenant).
- No tools — pure comparison logic (can be partly rule-based: compute deltas on KPIs/pricing numerically first, and only invoke the LLM to explain deltas that cross a threshold you define, e.g. >10% change or a new competitor entry).
- Output schema:

```json
{
  "significant_change_detected": true,
  "changes": ["string", "..."],
  "alert_message": "string or null",
  "concept_for_validation": "string"
}
```

- `concept_for_validation` is whatever needs human/persona judgment this cycle — e.g. a new pricing recommendation, a proposed positioning change. This is what feeds Phase 6.
- **Scheduling**: this agent's completion is what triggers the next scheduled run of Agent 1a/1b (see section 6). It does not call them directly — it sets a "next_run_at" or simply lets the external scheduler pick up the next cycle.

### Phase 6 — Persona panel (parallel)

- Seed the `personas` table with defaults: "Budget-conscious parent," "Gen Z trendsetter," "Loyal long-time customer." Support tenants adding custom personas (just a name + system prompt).
- Input to each persona agent: `{ concept: monitoring_agent.concept_for_validation, persona_system_prompt }`
- Round 1: each persona agent runs independently (no visibility into other personas), producing an initial reaction.
- Output schema (per persona, round 1):

```json
{
  "persona_name": "string",
  "reaction": "string",
  "sentiment": "positive | neutral | negative",
  "key_concerns": ["string", "..."]
}
```

### Phase 7 — Panel debate

- Input: all round-1 persona outputs, compiled into one transcript.
- For each persona agent, run a round 2 (and optionally round 3) invocation: "here is what the other personas said — does this change your view, and why?"
- Cap at 2–3 rounds. Stop early if responses stop changing meaningfully (you can detect this cheaply by checking if `sentiment` is unchanged across all personas from one round to the next).
- Output: append each round's responses to the transcript; this full transcript is what the moderator reads.

### Phase 8 — Moderator agent

- Input: the full multi-round transcript from all personas.
- No tools — pure synthesis.
- Directive: identify where personas agreed and disagreed, and compute a brand-risk score (0–100, lower is safer) per persona segment plus an overall score. Be explicit about which persona's concerns drove the score down.
- Output schema:

```json
{
  "agreement_summary": "string",
  "disagreement_summary": "string",
  "overall_brand_risk_score": 0,
  "score_by_segment": [
    { "persona_name": "string", "score": 0, "reasoning": "string" }
  ]
}
```

- This output is what the Scoring Dashboard reads directly — no extra transformation needed if you keep the schema stable.

### Phase 9 — Report generator

- Input: moderator output + the full transcript + the strategy agent's original concept.
- This is a templating step, not a reasoning step — render the structured JSON into a Markdown or PDF document. Do not make another free-form LLM call here; use a template engine (Jinja2, or a simple string template) so the report format stays consistent across runs.

---

## 5. Multi-variant support (optional, build after Phase 9 works for a single concept)

To support comparing multiple concepts (e.g. three logo/positioning options) with one panel run:

- Fan Phase 6 out across each variant: every persona reacts to every variant (N personas × M variants independent calls).
- Phase 7's debate transcript should be grouped by variant.
- Phase 8's moderator receives all variants' transcripts together and is explicitly asked to rank variants per segment, not just score each in isolation.

---

## 6. Scheduling

- Use a simple cron trigger (hourly/daily/weekly per tenant preference) that creates a new `pipeline_runs` row with `triggered_by = 'schedule'` and kicks off Phase 2.
- A manual "run now" button in the dashboard does the same thing with `triggered_by = 'manual'`.
- The Monitoring Agent (Phase 5) does not need to programmatically re-trigger anything — the scheduler is the source of truth for cadence. Keep these decoupled.

---

## 7. Prompting guidance (apply to every agent)

- Put the JSON schema directly in the system prompt, with an instruction like: "Respond with only valid JSON matching this exact schema. No markdown fences, no prose before or after."
- Validate the output against the schema in code before writing to `pipeline_steps`. If validation fails, retry once with the error appended to the prompt ("your last response failed validation for this reason: ..."); if it fails twice, mark the step `failed` and halt the run.
- Keep each agent's system prompt scoped to its one job. Resist the urge to let the analysis agent also do strategy, or let personas see the moderator's scoring criteria (that would bias their reactions).

---

## 8. Error handling

- **Parallel join timeout**: if Agent 1a or 1b hasn't completed within a set time (e.g. 5 minutes), proceed to Analysis with whichever succeeded and flag `partial_data: true` in the analysis input, rather than blocking the whole run indefinitely.
- **Schema validation failure**: retry once, then fail the run and alert whoever owns the tenant (log + notification, not a silent failure).
- **Persona panel partial failure**: if one persona agent fails, proceed to debate/moderation with the personas that succeeded, and note the missing persona in the moderator's input so it doesn't silently treat a 2-persona panel as if it were complete.

---

## 9. Build order checklist

- [ ] Phase 1: DB schema + state machine + hello-world agent through the pipeline
- [ ] Phase 2: Market intelligence agent + competitor recon agent, running in parallel, with a join
- [ ] Phase 3: Analysis agent
- [ ] Phase 4: Strategy agent
- [ ] Phase 5: Monitoring agent + delta detection
- [ ] Phase 6: Persona agents (start with the 3 defaults), round 1 only
- [ ] Phase 7: Panel debate, round 2+
- [ ] Phase 8: Moderator agent + scoring dashboard view
- [ ] Phase 9: Report generator
- [ ] Optional: multi-variant comparison
- [ ] Scheduling + manual trigger in the dashboard

Build and test each checkbox before moving to the next — every phase should be runnable and inspectable (via the `pipeline_steps` table) on its own before you wire in the next agent.
