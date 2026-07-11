import json
import sys
from typing import Any

from config import settings
from db import create_run


def _parse_input() -> dict[str, Any]:
    raw = sys.stdin.read()
    return json.loads(raw)


def run_pipeline(input_data: dict[str, Any]) -> dict[str, Any]:
    tenant_id = input_data["tenant_id"]
    business_description = input_data["business_description"]
    known_competitors = input_data.get("known_competitors", [])
    run_id = input_data.get("run_id") or create_run(tenant_id)

    from scraping.agent import run as run_market_intel
    from analysis.agent import run as run_competitor_recon
    from strategy.agent import run as run_strategy

    results: dict[str, Any] = {}

    try:
        results["market_intelligence"] = run_market_intel(
            tenant_id, business_description, run_id
        )
    except Exception as e:
        results["market_intelligence"] = {"error": str(e)}

    try:
        results["competitor_recon"] = run_competitor_recon(
            tenant_id, business_description, run_id, known_competitors
        )
    except Exception as e:
        results["competitor_recon"] = {"error": str(e)}

    try:
        market_intel = results.get("market_intelligence")
        competitor_recon = results.get("competitor_recon")
        if isinstance(market_intel, dict) and "error" not in market_intel and isinstance(competitor_recon, dict) and "error" not in competitor_recon:
            results["strategy_output"] = run_strategy(
                tenant_id, business_description, run_id,
                market_intel=market_intel,
                competitor_recon=competitor_recon,
            )
        else:
            results["strategy_output"] = {"error": "Skipped due to upstream errors"}
    except Exception as e:
        results["strategy_output"] = {"error": str(e)}

    return results


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
    else:
        result = run_pipeline(input_data)

    print(json.dumps(result, indent=2))
