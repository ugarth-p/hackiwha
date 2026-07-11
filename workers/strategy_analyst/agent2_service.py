"""Agent 2 — Analysis + Strategy service.

Calls Gemini (google-genai SDK) with response_schema forcing valid JSON,
validates against Agent2Output, retries once on failure.

Standalone test:
    python agent2_service.py
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path
from unittest.mock import patch

from google import genai
from google.genai import types
from pydantic import ValidationError

from dotenv import load_dotenv

from prompt import SYSTEM_PROMPT
from schemas import Agent2Input, Agent2Output

MODEL_NAME = "gemini-3-flash-preview"
DATA_DIR = Path(__file__).parent

load_dotenv(DATA_DIR / ".env")

_client: genai.Client | None = None


def get_client() -> genai.Client:
    """Return a configured Gemini client (created once from env var)."""
    global _client
    if _client is not None:
        return _client
    import os

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("ERROR: Set the GEMINI_API_KEY environment variable.")
    _client = genai.Client(api_key=api_key)
    return _client


def build_prompt(user_input: Agent2Input) -> str:
    """Combine the system instructions with the user data into one prompt."""
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"## Input Data\n\n```json\n{user_input.model_dump_json(indent=2)}\n```"
    )


def call_gemini(prompt: str, max_retries: int = 5) -> Agent2Output:
    """Send the prompt to Gemini and return a validated Agent2Output."""
    import time
    client = get_client()
    last_exc = None
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.4,
                    response_mime_type="application/json",
                    response_schema=Agent2Output,
                ),
            )
            if response.parsed is not None:
                return response.parsed
            return Agent2Output.model_validate_json(response.text)
        except Exception as exc:
            last_exc = exc
            if "RESOURCE_EXHAUSTED" in str(exc) or "429" in str(exc):
                wait = min(30 * (attempt + 1), 120)
                print(f"[retry] Gemini 429 on attempt {attempt+1}/{max_retries}, waiting {wait}s...", file=sys.stderr)
                time.sleep(wait)
            else:
                raise
    raise last_exc


def run_agent2(user_input: Agent2Input) -> Agent2Output:
    """Full pipeline: prompt -> Gemini -> validate -> return (or retry once)."""
    prompt = build_prompt(user_input)

    try:
        return call_gemini(prompt)
    except (json.JSONDecodeError, ValidationError, Exception) as first_error:
        print(f"[retry] First attempt failed: {first_error}", file=sys.stderr)
        retry_prompt = (
            f"{prompt}\n\n"
            "## Previous response failed validation\n"
            f"Error: {first_error}\n"
            "Fix the issue and return valid JSON matching the schema exactly."
        )
        return call_gemini(retry_prompt)


# ---------------------------------------------------------------------------
# Standalone test
# ---------------------------------------------------------------------------

def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


# Hardcoded business description for the offline harness. Same one used in the
# original sample_agent1_output.json so output is comparable across test runs.
_HARNESS_BUSINESS = (
    "A project management and invoicing platform built specifically for "
    "independent freelancers and small creative studios."
)
_HARNESS_COMPETITORS = ["Asana", "Trello", "Bonsai"]


def _transform_to_agent2_input(
    market_intel: dict,
    competitor_recon: dict,
    business_description: str,
    patterns: list[dict],
) -> Agent2Input:
    """Map real scraping + analysis output into Agent2Input shape.

    Six fields have no real source and are left empty (gap option 1):
      client.features, client.target_audience,
      market.market_size, market.growth_rate,
      competitors[i].strengths, competitors[i].weaknesses.
    """
    competitors_in = competitor_recon.get("competitors", []) or []
    return Agent2Input(
        client={
            "name": "test-client",
            "description": business_description,
            "current_pricing": "; ".join(
                market_intel.get("typical_pricing_models", []) or []
            ),
            "features": [],
            "target_audience": "",
        },
        competitors=[
            {
                "name": c.get("name", ""),
                "pricing": c.get("pricing_notes", ""),
                "strengths": [],
                "weaknesses": [],
                "market_share": None,
            }
            for c in competitors_in
        ],
        market={
            "industry": market_intel.get("industry_summary", ""),
            "market_size": "",
            "growth_rate": "",
            "trends": market_intel.get("market_trends", []) or [],
        },
        user_sentiment=[
            c.get("review_sentiment_summary", "")
            for c in competitors_in
            if c.get("review_sentiment_summary")
        ],
        patterns=patterns,
    )


def _stub_worker_deps():
    """Patch external-dep functions inside each consumer module so agents
    run without Postgres / Tavily / OpenAI.

    Both ``scraping/agent.py`` and ``analysis/agent.py`` use bare imports
    (``from db import …``, ``from tools import …``, ``from embeddings import …``),
    so the patched names live in *their* namespaces, not in ``workers.db`` etc.

    Stubs applied to both ``scraping.agent`` and ``analysis.agent``:
      .web_search       -> returns []
      .web_fetch        -> returns ""
      .get_embedding    -> returns [0.0]*1536
      .ensure_tenant    -> no-op (returns None)
      .store_finding    -> returns a fake UUID string
    """
    workers_root = DATA_DIR.parent
    if str(workers_root) not in sys.path:
        sys.path.insert(0, str(workers_root))

    # config.py reads these eagerly at import time via os.environ[];
    # set them before any agent module is imported.
    os.environ.setdefault(
        "DATABASE_URL",
        "postgresql://stub:stub@localhost:5432/stub",
    )
    os.environ.setdefault("TAVILY_API_KEY", "stub")
    os.environ.setdefault("OPENAI_API_KEY", "stub")

    # Patch at consumer-module level (bare-import targets).
    patches = []
    for mod in ("scraping.agent", "analysis.agent"):
        patches += [
            patch(f"{mod}.web_search", return_value=[]),
            patch(f"{mod}.web_fetch", return_value=""),
            patch(f"{mod}.get_embedding", return_value=[0.0] * 1536),
            patch(f"{mod}.ensure_tenant", return_value=None),
            patch(f"{mod}.store_finding", return_value=str(uuid.uuid4())),
        ]

    return [p.start() for p in patches], patches


def _cleanup_stubs(patches):
    for p in reversed(patches):
        p.stop()


def main() -> None:
    entered, _ = _stub_worker_deps()
    try:
        from scraping.agent import run as run_market_intel
        from analysis.agent import run as run_competitor_recon

        print("Running Agent 1a (Market Intelligence) via scraping.agent...")
        market_intel = run_market_intel(
            tenant_id="test-tenant",
            business_description=_HARNESS_BUSINESS,
            run_id="test-run",
        )
        print(f"  -> {len(market_intel.get('market_trends', []))} trends, "
              f"{len(market_intel.get('sources', []))} sources")

        print("Running Agent 1b (Competitor Recon) via analysis.agent...")
        competitor_recon = run_competitor_recon(
            tenant_id="test-tenant",
            business_description=_HARNESS_BUSINESS,
            run_id="test-run",
            known_competitors=_HARNESS_COMPETITORS,
        )
        print(f"  -> {len(competitor_recon.get('competitors', []))} competitors")

        pattern_data = _load_json(DATA_DIR / "pattern_library.json")
        user_input = _transform_to_agent2_input(
            market_intel,
            competitor_recon,
            _HARNESS_BUSINESS,
            pattern_data["patterns"],
        )

        print(f"Calling Gemini for Agent 2 ({MODEL_NAME})...")
        result = run_agent2(user_input)
        print("\n=== Agent 2 Output ===\n")
        print(result.model_dump_json(indent=2))
    finally:
        _cleanup_stubs(entered)


if __name__ == "__main__":
    main()
