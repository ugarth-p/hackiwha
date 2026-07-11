import json
import sys
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from config import settings
from db import create_run


def _parse_input() -> dict[str, Any]:
    raw = sys.stdin.read()
    return json.loads(raw)


def _emit(name: str, output: Any) -> None:
    """Print a single JSONL line so the backend can process steps in real time."""
    print(json.dumps({"step": name, "output": output}), flush=True)


def run_pipeline(input_data: dict[str, Any]) -> None:
    tenant_id = input_data["tenant_id"]
    business_description = input_data["business_description"]
    known_competitors = input_data.get("known_competitors", [])
    run_id = input_data.get("run_id") or create_run(tenant_id)

    from scraping.agent import run as run_market_intel
    from analysis.agent import run as run_competitor_recon
    from strategy.agent import run as run_strategy

    market_intel: dict[str, Any] = {}
    competitor_recon: dict[str, Any] = {}

    with ThreadPoolExecutor(max_workers=2) as pool:
        future_mi = pool.submit(
            run_market_intel, tenant_id, business_description, run_id
        )
        future_cr = pool.submit(
            run_competitor_recon, tenant_id, business_description, run_id, known_competitors
        )

        try:
            market_intel = future_mi.result()
        except Exception as e:
            market_intel = {"error": str(e)}
        _emit("market_intelligence", market_intel)

        try:
            competitor_recon = future_cr.result()
        except Exception as e:
            competitor_recon = {"error": str(e)}
        _emit("competitor_recon", competitor_recon)

    if "error" not in market_intel and "error" not in competitor_recon:
        try:
            strategy = run_strategy(
                tenant_id, business_description, run_id,
                market_intel=market_intel,
                competitor_recon=competitor_recon,
            )
        except Exception as e:
            strategy = {"error": str(e)}
        _emit("strategy_output", strategy)
    else:
        _emit("strategy_output", {"error": "Skipped due to upstream errors"})


def run_monitoring(input_data: dict[str, Any]) -> dict[str, Any]:
    from monitoring.agent import run as run_monitoring_agent

    current_data = input_data.get("current_run_data", {})
    previous_data = input_data.get("previous_run_data")
    tenant_id = input_data.get("tenant_id", "")
    current_run_id = input_data.get("current_run_id", "")
    previous_run_id = input_data.get("previous_run_id", "")

    return run_monitoring_agent(
        current_data, previous_data, tenant_id,
        current_run_id=current_run_id,
        previous_run_id=previous_run_id,
    )


if __name__ == "__main__":
    input_data = _parse_input()
    mode = input_data.get("mode", "pipeline")

    if mode == "monitoring":
        result = run_monitoring(input_data)
        print(json.dumps(result, indent=2))
    else:
        run_pipeline(input_data)
