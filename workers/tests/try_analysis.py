"""See what the analysis agent (competitor recon) produces.

    python tests/try_analysis.py                      # mock mode — shows prompt, no quota
    python tests/try_analysis.py --live               # actually calls Tavily + Gemini
    python tests/try_analysis.py --live --known Trello Asana  # skip competitor discovery
"""
import json
import sys
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"

sys.path.insert(0, str(Path(__file__).parent.parent))

BUSINESS = "FreelanceFlow - AI-powered project management tool for freelance developers and designers"


def main():
    live = "--live" in sys.argv
    known = []
    if "--known" in sys.argv:
        idx = sys.argv.index("--known")
        known = sys.argv[idx + 1:]

    if live:
        from analysis.agent import run

        result = run("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", BUSINESS, "f47ac10b-58cc-4372-a567-0e02b2c3d479", known_competitors=known or None)
        print(json.dumps(result, indent=2))
    else:
        from analysis.agent import SYSTEM_PROMPT, COMPETITOR_SEARCH_TEMPLATES

        print("=" * 60)
        print("SYSTEM PROMPT:")
        print("=" * 60)
        print(SYSTEM_PROMPT)
        print()
        print("=" * 60)
        print("COMPETITOR SEARCH TEMPLATES:")
        print("=" * 60)
        for t in COMPETITOR_SEARCH_TEMPLATES:
            print(f"  - {t.format(name='<competitor>')}")
        print()
        print("=" * 60)
        print("OUTPUT SCHEMA:")
        print("=" * 60)
        print(json.dumps({
            "competitors": [{
                "name": "string",
                "pricing_notes": "string",
                "positioning": "string",
                "recent_activity": ["string", "..."],
                "review_sentiment_summary": "string",
                "sources": ["url", "..."],
            }]
        }, indent=2))
        print()
        print("Add --live to actually call Tavily + Gemini")
        print("Add --known Trello Asana to skip competitor discovery")


if __name__ == "__main__":
    main()
