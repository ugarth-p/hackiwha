"""See the full pipeline output with all stages mocked.

    python tests/try_pipeline.py
"""
import json
import sys
from pathlib import Path
from unittest.mock import patch

FIXTURES = Path(__file__).parent / "fixtures"

sys.path.insert(0, str(Path(__file__).parent.parent))

from strategy.agent import StrategyOutput


def main():
    market_intel = json.loads((FIXTURES / "market_intel.json").read_text())
    competitor_recon = json.loads((FIXTURES / "competitor_recon.json").read_text())
    strategy_output = json.loads((FIXTURES / "strategy_output.json").read_text())
    pipeline_input = json.loads((FIXTURES / "pipeline_input.json").read_text())

    with (
        patch("scraping.agent.run", return_value=market_intel),
        patch("analysis.agent.run", return_value=competitor_recon),
        patch("strategy.agent._call_gemini", return_value=StrategyOutput(**strategy_output)),
        patch("strategy.agent.store_finding"),
        patch("strategy.agent.get_embedding", return_value=[0.0] * 128),
        patch("strategy.agent.ensure_tenant"),
    ):
        from main import run_pipeline

        result = run_pipeline(pipeline_input)

    for stage, data in result.items():
        print("=" * 60)
        print(f"STAGE: {stage}")
        print("=" * 60)
        print(json.dumps(data, indent=2))
        print()


if __name__ == "__main__":
    main()
