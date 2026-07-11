"""See what the monitoring agent detects between two runs.

    python tests/try_monitoring.py                # identical runs — no changes
    python tests/try_monitoring.py --with-changes  # adds a new competitor + trend shift
"""
import json
import sys
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"

sys.path.insert(0, str(Path(__file__).parent.parent))

from monitoring.agent import run


def make_current(with_changes: bool = False) -> dict:
    data = json.loads((FIXTURES / "monitoring_previous.json").read_text())
    if not with_changes:
        return data
    data["competitor_recon"]["competitors"].append({
        "name": "DisruptorAI",
        "pricing_notes": "$3/mo flat — undercutting everyone",
        "positioning": "AI-native PM built exclusively for solo freelancers",
        "recent_activity": [
            "Launched with $2M seed round",
            "10k users in first month",
            "Added Figma and GitHub integrations"
        ],
        "review_sentiment_summary": "Explosive growth, users love the simplicity",
        "sources": ["https://disruptorai.com"],
    })
    data["market_intelligence"]["market_trends"].append(
        "AI-first tools displacing legacy PM software"
    )
    data["market_intelligence"]["common_customer_pain_points"].append(
        "Legacy tools too expensive for solo freelancers"
    )
    data["strategy_output"]["analysis"]["market_position"] = (
        "Repositioning as premium AI-native tool for freelancers, "
        "differentiating through deep automation."
    )
    return data


def main():
    with_changes = "--with-changes" in sys.argv
    label = "WITH CHANGES" if with_changes else "IDENTICAL RUNS"

    previous = json.loads((FIXTURES / "monitoring_previous.json").read_text())
    current = make_current(with_changes)

    result = run(
        current_run_data=current,
        previous_run_data=previous,
        tenant_id="a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    )

    print(f"[{label}]")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
