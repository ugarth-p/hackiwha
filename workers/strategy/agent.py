import json
import sys
import time
from pathlib import Path
from typing import Any

from google import genai
from google.api_core import exceptions as google_exceptions
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from config import settings
from db import ensure_tenant, store_finding
from embeddings import get_embedding

_client = genai.Client(api_key=settings.gemini_api_key)

MODEL_NAME = "gemini-3-flash-preview"

PATTERN_LIBRARY_PATH = (
    Path(__file__).parent.parent / "strategy_analyst" / "pattern_library.json"
)

SYSTEM_PROMPT = """\
You are a competitive strategy analyst for a brand market tracking system. \
You will receive market research data and competitor intelligence gathered \
by upstream research agents, along with a library of proven growth/pricing \
patterns.

Your task is to produce a comprehensive analysis and actionable strategy \
recommendations grounded in the specific data provided.

## Phase 1 — Competitive Analysis

Using the provided market and competitor data, produce:

1. **Market Position**: A paragraph summarizing where the client stands \
relative to competitors and market trends.

2. **SWOT Analysis**:
   - `strengths`: Internal advantages the client has based on the data.
   - `weaknesses`: Internal disadvantages or gaps.
   - `opportunities`: External opportunities grounded in market trends or \
competitor weaknesses. Each MUST have a unique, descriptive `title` and a \
`description`.
   - `threats`: External threats grounded in competitor strengths or market \
risks. Each MUST have a unique, descriptive `title` and a `description`.

3. **Competitor Gaps**: For each competitor, identify a specific gap or \
vulnerability the client can exploit.

## Phase 2 — Strategy Recommendations

Based on your analysis, recommend 5-7 strategy items. STRICTLY follow \
these rules:

- Each strategy item's `pattern` MUST be an exact name from the provided \
`patterns` list. Do NOT invent new pattern names.
- Each strategy item's `cites` MUST reference the exact `title` of an \
opportunity or threat from your Phase 1 analysis. Do NOT cite strengths, \
weaknesses, or competitor gaps.
- Each strategy item must have a `description` explaining the specific \
tactic and an `expected_impact` explaining the measurable or qualitative \
outcome.
- Every recommendation must be grounded in the specific data provided. \
No generic advice.

## Output format

Return ONLY the JSON object matching the provided schema. No markdown \
fences, no commentary outside the JSON.
"""


# ---------------------------------------------------------------------------
# Output schemas
# ---------------------------------------------------------------------------


class Opportunity(BaseModel):
    title: str
    description: str


class Threat(BaseModel):
    title: str
    description: str


class SWOTAnalysis(BaseModel):
    strengths: list[str]
    weaknesses: list[str]
    opportunities: list[Opportunity]
    threats: list[Threat]


class CompetitorGap(BaseModel):
    competitor: str
    gap: str


class Analysis(BaseModel):
    market_position: str
    swot: SWOTAnalysis
    competitor_gaps: list[CompetitorGap]


class StrategyItem(BaseModel):
    pattern: str = Field(
        description="Must match a pattern name from the provided library"
    )
    description: str
    cites: str = Field(
        description=(
            "Must reference the title of an opportunity or threat "
            "from the analysis"
        )
    )
    expected_impact: str


class StrategyOutput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    analysis: Analysis
    strategy: list[StrategyItem]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_pattern_library() -> list[dict[str, str]]:
    if PATTERN_LIBRARY_PATH.exists():
        data = json.loads(PATTERN_LIBRARY_PATH.read_text(encoding="utf-8"))
        return data.get("patterns", [])
    return []


def _build_prompt(
    market_intel: dict[str, Any],
    competitor_recon: dict[str, Any],
    patterns: list[dict[str, str]],
    business_description: str,
) -> str:
    input_data = {
        "business_description": business_description,
        "market_intelligence": market_intel,
        "competitor_research": competitor_recon,
        "patterns": patterns,
    }
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"## Input Data\n\n```json\n{json.dumps(input_data, indent=2)}\n```"
    )


# ---------------------------------------------------------------------------
# Gemini calls
# ---------------------------------------------------------------------------


def _call_gemini(prompt: str) -> StrategyOutput:
    response = _client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.4,
            response_mime_type="application/json",
            response_schema=StrategyOutput,
        ),
    )
    if response.parsed is not None:
        return response.parsed
    return StrategyOutput.model_validate_json(response.text)


def _call_with_retry(prompt: str) -> StrategyOutput:
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            return _call_gemini(prompt)
        except google_exceptions.ResourceExhausted as exc:
            last_exc = exc
            delay = 5.0 * (2**attempt)
            print(
                f"[retry] Rate-limited (attempt {attempt + 1}/3), "
                f"waiting {delay:.1f}s...",
                flush=True,
            )
            time.sleep(delay)
        except (json.JSONDecodeError, ValidationError, Exception) as exc:
            last_exc = exc
            print(f"[retry] Validation failed: {exc}", file=sys.stderr)
            prompt = (
                f"{prompt}\n\n"
                "## Previous response failed validation\n"
                f"Error: {exc}\n"
                "Fix the issue and return valid JSON matching the schema "
                "exactly."
            )
    raise last_exc  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Pipeline entry point
# ---------------------------------------------------------------------------


def run(
    tenant_id: str,
    business_description: str,
    run_id: str,
    market_intel: dict[str, Any] | None = None,
    competitor_recon: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ensure_tenant(tenant_id, business_description)

    market_intel = market_intel or {}
    competitor_recon = competitor_recon or {}
    patterns = _load_pattern_library()

    prompt = _build_prompt(
        market_intel, competitor_recon, patterns, business_description
    )
    result = _call_with_retry(prompt)

    output = result.model_dump()

    embedding_text = json.dumps(output)
    embedding = get_embedding(embedding_text)

    store_finding(
        tenant_id=tenant_id,
        run_id=run_id,
        agent_type="strategy",
        content=output,
        embedding=embedding,
    )

    return output
