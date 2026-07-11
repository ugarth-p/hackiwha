"""See what the scraping agent (market intelligence) produces.

    python tests/try_scraping.py           # mock mode — shows prompt, no quota
    python tests/try_scraping.py --live    # actually calls Tavily + Gemini
"""
import json
import sys
from pathlib import Path
from unittest.mock import patch

FIXTURES = Path(__file__).parent / "fixtures"

sys.path.insert(0, str(Path(__file__).parent.parent))

BUSINESS = "FreelanceFlow - AI-powered project management tool for freelance developers and designers"


def main():
    live = "--live" in sys.argv

    if live:
        from scraping.agent import run

        result = run("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", BUSINESS, "f47ac10b-58cc-4372-a567-0e02b2c3d479")
        print(json.dumps(result, indent=2))
    else:
        from scraping.agent import SYSTEM_PROMPT, SEARCH_QUERIES_TEMPLATE

        queries = [q.format(business=BUSINESS) for q in SEARCH_QUERIES_TEMPLATE]
        print("=" * 60)
        print("SEARCH QUERIES:")
        print("=" * 60)
        for q in queries:
            print(f"  - {q}")
        print()
        print("=" * 60)
        print("SYSTEM PROMPT:")
        print("=" * 60)
        print(SYSTEM_PROMPT)
        print()
        print("=" * 60)
        print("OUTPUT SCHEMA:")
        print("=" * 60)
        print(json.dumps({
            "industry_summary": "string",
            "market_trends": ["string", "..."],
            "typical_pricing_models": ["string", "..."],
            "common_customer_pain_points": ["string", "..."],
            "sources": ["url", "..."],
        }, indent=2))
        print()
        print("Add --live to actually call Tavily + Gemini")


if __name__ == "__main__":
    main()
