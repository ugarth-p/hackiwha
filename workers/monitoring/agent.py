import json
import re
from typing import Any

import google.generativeai as genai
from pydantic import BaseModel, Field

from config import settings

genai.configure(api_key=settings.gemini_api_key)

SIGNIFICANT_THRESHOLD = 0.10

SYSTEM_PROMPT = """You are a Market Monitoring Analyst. You compare two research cycles and identify meaningful changes.

Given the deltas between a current and previous research run, explain:
1. What changed and why it matters
2. What needs human validation or strategic decision-making

Be concise. Focus on business impact, not raw data."""

LLM_PROMPT_TEMPLATE = """Compare these two research cycles for a business.

CURRENT RUN output:
{current}

PREVIOUS RUN output:
{previous}

DETECTED DELTAS:
{deltas}

Explain what changed, why it matters, and what specific action or decision needs human validation.
Respond with valid JSON:
{{
  "alert_message": "string - concise summary of significant changes",
  "concept_for_validation": "string - specific recommendation that needs human judgment"
}}"""


class MonitoringOutput(BaseModel):
    significant_change_detected: bool = False
    changes: list[str] = Field(default_factory=list)
    alert_message: str | None = None
    concept_for_validation: str = ""


def _extract_list(data: dict[str, Any], key: str) -> list[str]:
    val = data.get(key, [])
    if isinstance(val, list):
        return [str(v) for v in val]
    return []


def _extract_numeric(data: dict[str, Any], key: str) -> float | None:
    val = data.get(key)
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        nums = re.findall(r"[\d.]+", val)
        if nums:
            try:
                return float(nums[0])
            except ValueError:
                return None
    return None


def _extract_dict(data: dict[str, Any], key: str) -> dict[str, Any]:
    val = data.get(key)
    if isinstance(val, dict):
        return val
    return {}


def _compute_list_delta(
    current: list[str], previous: list[str], label: str
) -> list[str]:
    changes: list[str] = []
    cur_set = set(current)
    prev_set = set(previous)

    for item in cur_set - prev_set:
        changes.append(f"New {label}: '{item}'")
    for item in prev_set - cur_set:
        changes.append(f"Removed {label}: '{item}'")

    return changes


def _compute_numeric_delta(
    current_val: float | None, previous_val: float | None, label: str
) -> list[str]:
    if current_val is None or previous_val is None:
        return []
    if previous_val == 0:
        return []

    pct_change = (current_val - previous_val) / abs(previous_val)
    if abs(pct_change) > SIGNIFICANT_THRESHOLD:
        direction = "increased" if pct_change > 0 else "decreased"
        return [
            f"{label} {direction} from {previous_val} to {current_val} ({abs(pct_change):.0%} change)"
        ]
    return []


def _compute_dict_delta(
    current: dict[str, Any], previous: dict[str, Any], label: str
) -> list[str]:
    changes: list[str] = []
    all_keys = set(current.keys()) | set(previous.keys())

    for key in all_keys:
        cur_val = current.get(key)
        prev_val = previous.get(key)
        if cur_val != prev_val:
            changes.append(f"{label}.{key} changed: '{prev_val}' -> '{cur_val}'")

    return changes


def _rule_based_comparison(
    current: dict[str, Any], previous: dict[str, Any]
) -> tuple[list[str], bool]:
    all_changes: list[str] = []
    significant = False

    current_competitors = _extract_list(current, "competitor_names")
    previous_competitors = _extract_list(previous, "competitor_names")
    competitor_changes = _compute_list_delta(
        current_competitors, previous_competitors, "competitor"
    )
    if competitor_changes:
        significant = True
    all_changes.extend(competitor_changes)

    current_pricing = _extract_list(current, "pricing_models")
    previous_pricing = _extract_list(previous, "pricing_models")
    pricing_changes = _compute_list_delta(current_pricing, previous_pricing, "pricing model")
    all_changes.extend(pricing_changes)

    current_trends = _extract_list(current, "market_trends")
    previous_trends = _extract_list(previous, "market_trends")
    trend_changes = _compute_list_delta(current_trends, previous_trends, "market trend")
    if trend_changes:
        significant = True
    all_changes.extend(trend_changes)

    current_pain = _extract_list(current, "customer_pain_points")
    previous_pain = _extract_list(previous, "customer_pain_points")
    pain_changes = _compute_list_delta(current_pain, previous_pain, "pain point")
    if pain_changes:
        significant = True
    all_changes.extend(pain_changes)

    current_market_size = _extract_numeric(current, "market_size")
    previous_market_size = _extract_numeric(previous, "market_size")
    size_changes = _compute_numeric_delta(
        current_market_size, previous_market_size, "Market size"
    )
    if size_changes:
        significant = True
    all_changes.extend(size_changes)

    current_growth = _extract_numeric(current, "growth_rate")
    previous_growth = _extract_numeric(previous, "growth_rate")
    growth_changes = _compute_numeric_delta(
        current_growth, previous_growth, "Growth rate"
    )
    if growth_changes:
        significant = True
    all_changes.extend(growth_changes)

    current_sentiment = _extract_numeric(current, "average_sentiment")
    previous_sentiment = _extract_numeric(previous, "average_sentiment")
    sentiment_changes = _compute_numeric_delta(
        current_sentiment, previous_sentiment, "Average sentiment"
    )
    if sentiment_changes:
        significant = True
    all_changes.extend(sentiment_changes)

    current_strategy = _extract_dict(current, "strategy_output")
    previous_strategy = _extract_dict(previous, "strategy_output")
    if current_strategy or previous_strategy:
        strategy_changes = _compute_dict_delta(
            current_strategy, previous_strategy, "Strategy"
        )
        if strategy_changes:
            significant = True
        all_changes.extend(strategy_changes)

    return all_changes, significant


def _llm_explain(
    current: dict[str, Any], previous: dict[str, Any], deltas: list[str]
) -> dict[str, str]:
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        system_instruction=SYSTEM_PROMPT,
    )

    prompt = LLM_PROMPT_TEMPLATE.format(
        current=json.dumps(current, indent=2),
        previous=json.dumps(previous, indent=2),
        deltas=json.dumps(deltas, indent=2),
    )

    response = model.generate_content(prompt)
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(raw)


def run(
    current_run_data: dict[str, Any],
    previous_run_data: dict[str, Any] | None,
    tenant_id: str = "",
) -> dict[str, Any]:
    if previous_run_data is None:
        return MonitoringOutput(
            significant_change_detected=True,
            changes=["First run — no previous data to compare"],
            alert_message="Initial research run completed. Baseline established.",
            concept_for_validation="Review initial findings and confirm business description accuracy.",
        ).model_dump()

    deltas, significant = _rule_based_comparison(current_run_data, previous_run_data)

    result = MonitoringOutput(
        significant_change_detected=significant,
        changes=deltas,
    )

    if significant and deltas:
        try:
            llm_output = _llm_explain(current_run_data, previous_run_data, deltas)
            result.alert_message = llm_output.get("alert_message")
            result.concept_for_validation = llm_output.get("concept_for_validation", "")
        except Exception:
            result.alert_message = f"Significant changes detected: {'; '.join(deltas)}"
            result.concept_for_validation = "Review the detected changes manually."

    return result.model_dump()


SUGGESTIONS_SYSTEM_PROMPT = """You are a strategic business analyst. A user reviewed a strategy output and rejected it.
Analyze the strategy and explain what could be improved. Be specific and actionable."""

SUGGESTIONS_PROMPT_TEMPLATE = """A user reviewed the following strategy output and was not satisfied.

STRATEGY OUTPUT:
{strategy_output}

USER FEEDBACK (if any):
{feedback}

Analyze what's wrong with this strategy and suggest specific modifications.
Respond with valid JSON:
{{
  "suggestions": "string - specific, actionable suggestions for improving the strategy"
}}"""


def generate_suggestions(
    strategy_output: dict[str, Any], feedback: str = ""
) -> dict[str, str]:
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        system_instruction=SUGGESTIONS_SYSTEM_PROMPT,
    )

    prompt = SUGGESTIONS_PROMPT_TEMPLATE.format(
        strategy_output=json.dumps(strategy_output, indent=2),
        feedback=feedback or "No specific feedback provided.",
    )

    response = model.generate_content(prompt)
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(raw)
