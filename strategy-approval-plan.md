# Strategy Approval Step for Monitoring

## Goal

Before monitoring runs (manual triggers only), show the user the strategy output and ask if they approve it. If rejected, use LLM to suggest modifications — then monitoring still runs normally.

## Flow

1. `POST /api/monitoring/preview` with `{ tenantId, currentRunId }` → returns strategy output for review
2. User reviews the strategy output
3. `POST /api/monitoring/run` with `{ tenantId, currentRunId, approved: boolean, feedback?: string }`
   - If `approved=false`: LLM generates modification suggestions, then monitoring runs. Response includes both suggestions AND monitoring results.
   - If `approved=true`: monitoring runs normally, no suggestions.
4. Scheduled (cron) monitoring auto-approves — no preview needed.

## Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `backend/src/monitoring/monitoring.dto.ts` | Add `approved` (boolean, optional, default true) and `feedback` (string, optional) to `RunMonitoringDto` |
| 2 | `workers/monitoring/agent.py` | Add `generate_suggestions(strategy_output, feedback)` function — calls Gemini to analyze rejected strategy and suggest modifications |
| 3 | `workers/main.py` | Add `mode: "suggestions"` handler that calls `generate_suggestions()` |
| 4 | `backend/src/monitoring/monitoring.service.ts` | Add `getPreview(tenantId, runId)` method; modify `runMonitoring()` to spawn suggestions worker when `approved=false` |
| 5 | `backend/src/monitoring/monitoring.controller.ts` | Add `GET /api/monitoring/preview/:tenantId/:runId` endpoint |

## Detailed Changes

### 1. `backend/src/monitoring/monitoring.dto.ts`

Add two optional fields to `RunMonitoringDto`:

```ts
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class RunMonitoringDto {
  @IsString()
  tenantId: string;

  @IsString()
  currentRunId: string;

  @IsOptional()
  @IsBoolean()
  approved?: boolean = true;

  @IsOptional()
  @IsString()
  feedback?: string;
}
```

### 2. `workers/monitoring/agent.py`

Add new function at the end of the file:

```python
SUGGESTIONS_SYSTEM_PROMPT = """You are a strategic business analyst. A user reviewed a strategy output and rejected it.
Analyze the strategy and explain what could be improved. Be specific and actionable."""

SUGGESTIONS_PROMPT_TEMPLATE = """A user reviewed the following strategy output and was not satisfied.

STRATEGY OUTPUT:
{strategy_output}

USER FEEDBACK (if any):
{feedback}

Analyze what's wrong with this strategy and suggest specific modifications.
Respond with valid JSON:
{{
  "suggestions": "string - specific, actionable suggestions for improving the strategy"
}}"""


def generate_suggestions(
    strategy_output: dict[str, Any], feedback: str = ""
) -> dict[str, str]:
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        system_instruction=SUGGESTIONS_SYSTEM_PROMPT,
    )

    prompt = SUGGESTIONS_PROMPT_TEMPLATE.format(
        strategy_output=json.dumps(strategy_output, indent=2),
        feedback=feedback or "No specific feedback provided.",
    )

    response = model.generate_content(prompt)
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(raw)
```

### 3. `workers/main.py`

Add new handler in `__main__` block:

```python
elif mode == "suggestions":
    from monitoring.agent import generate_suggestions

    strategy_output = input_data.get("strategy_output", {})
    feedback = input_data.get("feedback", "")
    result = generate_suggestions(strategy_output, feedback)
```

### 4. `backend/src/monitoring/monitoring.service.ts`

Add `getPreview()` method:

```ts
async getPreview(tenantId: string, runId: string) {
  const run = await this.prisma.pipelineRun.findUniqueOrThrow({
    where: { id: runId },
    include: { steps: true },
  });

  if (run.tenantId !== tenantId) {
    throw new Error('Run does not belong to this tenant');
  }

  const strategyStep = run.steps.find(s => s.stepName === 'strategy_output');
  const strategyOutput = strategyStep?.outputJson ?? {};

  return { tenantId, runId, strategyOutput };
}
```

Modify `runMonitoring()` — after spawning monitoring worker, if `approved === false`:

```ts
// After existing monitoring worker spawn + save...
let suggestions = null;
if (dto.approved === false) {
  suggestions = await this.spawnSuggestionsWorker(
    currentData.strategy_output ?? {},
    dto.feedback ?? '',
  );
}

return { ...saved, suggestions };
```

Add `spawnSuggestionsWorker()`:

```ts
private spawnSuggestionsWorker(
  strategyOutput: Record<string, any>,
  feedback: string,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const workerPath = join(__dirname, '..', '..', '..', 'workers', 'main.py');
    const python = spawn('python3', [workerPath], {
      cwd: join(__dirname, '..', '..', '..', 'workers'),
      env: { ...process.env },
    });

    const payload = JSON.stringify({
      mode: 'suggestions',
      strategy_output: strategyOutput,
      feedback,
    });
    python.stdin.write(payload);
    python.stdin.end();

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    python.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    python.on('close', (code) => {
      if (code === 0) {
        try { resolve(JSON.parse(stdout)); }
        catch { reject(new Error(`Failed to parse suggestions output: ${stdout}`)); }
      } else {
        reject(new Error(`Suggestions worker failed (code ${code}): ${stderr}`));
      }
    });

    python.on('error', reject);
  });
}
```

### 5. `backend/src/monitoring/monitoring.controller.ts`

Add preview endpoint:

```ts
@Get('preview/:tenantId/:runId')
async getPreview(
  @Param('tenantId') tenantId: string,
  @Param('runId') runId: string,
) {
  return this.monitoringService.getPreview(tenantId, runId);
}
```

## No Schema Changes

Suggestions are returned inline in the API response, not persisted to the database. No Prisma migration needed.

## Verification

1. Build backend: `cd backend && npm run build`
2. Test preview endpoint manually: `curl http://localhost:3000/api/monitoring/preview/:tenantId/:runId`
3. Test run with approval: `curl -X POST http://localhost:3000/api/monitoring/run -H 'Content-Type: application/json' -d '{"tenantId":"...","currentRunId":"...","approved":true}'`
4. Test run with rejection: `curl -X POST http://localhost:3000/api/monitoring/run -H 'Content-Type: application/json' -d '{"tenantId":"...","currentRunId":"...","approved":false,"feedback":"Pricing looks off"}'`
