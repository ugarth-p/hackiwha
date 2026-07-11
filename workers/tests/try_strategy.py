"""See what the strategy agent produces with mock data.

    python tests/try_strategy.py           # mock mode — shows the prompt, no quota
    python tests/try_strategy.py --live    # actually calls Gemini
"""
import json
import sys
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"

sys.path.insert(0, str(Path(__file__).parent.parent))


def main():
    live = "--live" in sys.argv

    market_intel = json.loads((FIXTURES / "market_intel.json").read_text())
    competitor_recon = json.loads((FIXTURES / "competitor_recon.json").read_text())

    if live:
        from strategy.agent import run

        result = run(
            tenant_id="a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
            business_description="FreelanceFlow - AI-powered project management for freelancers",
            run_id="f47ac10b-58cc-4372-a567-0e02b2c3d479",
            market_intel=market_intel,
            competitor_recon=competitor_recon,
        )
        print(json.dumps(result, indent=2))
    else:
        from strategy.agent import _build_prompt, _load_pattern_library

        patterns = _load_pattern_library()
        prompt = _build_prompt(
            market_intel, competitor_recon, patterns, "FreelanceFlow - AI-powered project management for freelancers"
        )
        print("=" * 60)
        print("PROMPT THAT WOULD BE SENT TO GEMINI:")
        print("=" * 60)
        print(prompt)
        print()
        print("=" * 60)
        print("Add --live to actually call Gemini and see the output")
        print("=" * 60)


if __name__ == "__main__":
    main()
