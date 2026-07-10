import json
from typing import Any

import google.generativeai as genai

from config import settings

genai.configure(api_key=settings.gemini_api_key)

SYSTEM_PROMPT = """You are a Brand Strategy Agent. Given market intelligence and competitor research, develop an actionable marketing strategy.

Focus on:
1. Positioning recommendation
2. Messaging direction
3. Pricing strategy
4. Top 3-5 recommended actions

Be specific and actionable. Reference competitor data when making recommendations."""


def run(
    tenant_id: str,
    business_description: str,
    run_id: str,
    market_intel: dict[str, Any] | None = None,
    competitor_recon: dict[str, Any] | None = None,
) -> dict[str, Any]:
    context_parts = []

    if market_intel:
        context_parts.append(
            f"MARKET INTELLIGENCE:\n{json.dumps(market_intel, indent=2)}"
        )
    if competitor_recon:
        context_parts.append(
            f"COMPETITOR RESEARCH:\n{json.dumps(competitor_recon, indent=2)}"
        )

    context = "\n\n".join(context_parts) if context_parts else "No research data available."

    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        system_instruction=SYSTEM_PROMPT,
    )

    prompt = f"""Business: {business_description}

{context}

Develop a strategy based on this research.
Respond with valid JSON:
{{
  "positioning": "string - recommended positioning",
  "messaging": "string - messaging direction",
  "pricing_recommendation": "string - pricing strategy",
  "recommended_actions": ["string", "..."] - list of specific actions
}}"""

    response = model.generate_content(prompt)
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(raw)
