import asyncio
import json
import sys
import time
from typing import Any

from config import settings
from db import create_run, update_run


def _parse_input() -> dict[str, Any]:
    raw = sys.stdin.read()
    return json.loads(raw)


async def _run_agent(coro) -> dict[str, Any]:
    return await coro


def run_pipeline(input_data: dict[str, Any]) -> dict[str, Any]:
    tenant_id = input_data["tenant_id"]
    business_description = input_data["business_description"]
    known_competitors = input_data.get("known_competitors", [])

    run_id = create_run(tenant_id)

    from scraping.agent import run as run_market_intel
    from analysis.agent import run as run_competitor_recon

    async def _execute():
        market_task = asyncio.to_thread(
            run_market_intel, tenant_id, business_description, run_id
        )
        competitor_task = asyncio.to_thread(
            run_competitor_recon, tenant_id, business_description, run_id, known_competitors
        )
        results = await asyncio.gather(market_task, competitor_task, return_exceptions=True)
        return results

    try:
        results = asyncio.run(asyncio.wait_for(_execute(), timeout=settings.pipeline_timeout))
    except asyncio.TimeoutError:
        update_run(run_id, "failed")
        return {"run_id": run_id, "status": "timeout", "error": "Pipeline timed out"}

    market_result, competitor_result = results
    errors = []

    if isinstance(market_result, Exception):
        errors.append({"agent": "market_intel", "error": str(market_result)})
        market_result = None
    if isinstance(competitor_result, Exception):
        errors.append({"agent": "competitor_recon", "error": str(competitor_result)})
        competitor_result = None

    update_run(run_id, "completed")

    return {
        "run_id": run_id,
        "status": "completed",
        "market_intelligence": market_result,
        "competitor_recon": competitor_result,
        "errors": errors if errors else None,
    }


if __name__ == "__main__":
    input_data = _parse_input()
    result = run_pipeline(input_data)
    print(json.dumps(result, indent=2))
