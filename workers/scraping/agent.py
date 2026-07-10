import json
import sys
from typing import Any

from google import genai
from pydantic import BaseModel, Field

from config import settings
from db import ensure_tenant, store_finding
from embeddings import get_embedding
from retry import generate_with_retry
from tools import web_fetch, web_search

_client = genai.Client(api_key=settings.gemini_api_key)

SYSTEM_PROMPT = """You are a Market Intelligence Agent. Your job is to research the GENERAL MARKET for a given business description.

IMPORTANT: Do NOT research named competitors. Focus on the overall industry landscape.

For the given business, research and synthesize:
1. Industry size and growth trajectory
2. Current market trends (technology, consumer behavior, regulation)
3. Typical pricing models used in this industry
4. Common customer pain points and unmet needs
5. Relevant regulatory factors

Use the web_search tool to gather data, then synthesize findings into structured output.
Always cite your sources as URLs."""

SEARCH_QUERIES_TEMPLATE = [
    "{business} industry market size growth 2024 2025",
    "{business} pricing models revenue streams",
    "{business} customer pain points complaints",
]


class MarketIntelOutput(BaseModel):
    industry_summary: str
    market_trends: list[str] = Field(default_factory=list)
    typical_pricing_models: list[str] = Field(default_factory=list)
    common_customer_pain_points: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)


def _build_search_context(business_description: str) -> str:
    collected: list[dict[str, str]] = []
    sources: list[str] = []

    for template in SEARCH_QUERIES_TEMPLATE:
        query = template.format(business=business_description)
        results = web_search(query, max_results=3)
        for r in results:
            collected.append(r)
            if r["url"] not in sources:
                sources.append(r["url"])

    for r in collected[:3]:
        if r["url"]:
            try:
                extracted = web_fetch(r["url"])
                if extracted:
                    r["content"] = extracted[:2000]
            except Exception:
                pass

    context_parts = []
    for r in collected:
        context_parts.append(f"[{r['title']}]({r['url']})\n{r['content']}")
    return "\n\n---\n\n".join(context_parts)


def _synthesize(business_description: str, search_context: str) -> dict[str, Any]:
    prompt = f"""Research the market for: {business_description}

Here is the gathered research data:

{search_context}

Based on this data, provide a structured market intelligence report.
Respond with valid JSON matching this exact schema:
{{
  "industry_summary": "string - comprehensive overview of the industry",
  "market_trends": ["string", "..."] - list of key trends,
  "typical_pricing_models": ["string", "..."] - list of common pricing approaches,
  "common_customer_pain_points": ["string", "..."] - list of customer frustrations,
  "sources": ["url", "..."] - list of source URLs used
}}"""

    raw = generate_with_retry(
        _client,
        model="gemini-3-flash-preview",
        contents=prompt,
        config=genai.types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
        ),
    )
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(raw)


def run(tenant_id: str, business_description: str, run_id: str) -> dict[str, Any]:
    ensure_tenant(tenant_id, business_description)

    search_context = _build_search_context(business_description)
    result = _synthesize(business_description, search_context)

    validated = MarketIntelOutput(**result)

    embedding_text = json.dumps(validated.model_dump())
    embedding = get_embedding(embedding_text)

    store_finding(
        tenant_id=tenant_id,
        run_id=run_id,
        agent_type="market_intel",
        content=validated.model_dump(),
        embedding=embedding,
    )

    return validated.model_dump()
