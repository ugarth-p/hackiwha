"""FastAPI wrapper for Agent 2 — Analysis + Strategy.

Run:
    uvicorn main:app --reload

Test:
    curl -X POST http://localhost:8000/agent2/run \
      -H "Content-Type: application/json" \
      -d @sample_request.json
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException

from agent2_service import run_agent2
from schemas import Agent2Input, Agent2Output

app = FastAPI(title="Agent 2 — Analysis + Strategy", version="0.1.0")


@app.post("/agent2/run", response_model=Agent2Output)
async def agent2_run(payload: Agent2Input) -> Agent2Output:
    """Accept Agent 1 output + pattern library, return analysis + strategy."""
    try:
        result = run_agent2(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return result


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
