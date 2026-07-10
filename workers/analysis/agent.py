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

SYSTEM_PROMPT = """You are a Competitor Reconnaissance Agent. Your job is to research specific competitors in a market.

For each competitor, gather:
1. Pricing notes (what they charge, tiers, free trials)
2. Positioning (how they describe themselves, target audience, USP)
3. Recent activity (new features, launches, partnerships, funding)
4. Review sentiment summary (what users say on review sites)
5. Sources (URLs for everything you cite)

IMPORTANT: Stay strictly factual. Only report what you found — do not speculate.
If information is unavailable for a field, say "Not discoverable from public sources."
Always use the web_search tool to find real data."""

COMPETITOR_SEARCH_TEMPLATES = [
    "{name} pricing plans cost",
    "{name} reviews sentiment user feedback 2024 2025",
]


def _discover_competitors(business_description: str) -> list[str]:
    results = web_search(f"{business_description} top competitors companies", max_results=5)
    context = "\n".join(f"[{r['title']}] {r['content']}" for r in results)

    prompt = f"""Given this business description: {business_description}

And these search results:
{context}

List the top 3-5 most relevant competitor company names.
Respond with ONLY a JSON array of strings, e.g. ["Company A", "Company B", "Company C"]"""

    raw = generate_with_retry(
        _client,
        model="gemini-3-flash-preview",
        contents=prompt,
    )
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(raw)


def _research_competitor(name: str) -> dict[str, Any]:
    collected: list[dict[str, str]] = []
    sources: list[str] = []

    for template in COMPETITOR_SEARCH_TEMPLATES:
        query = template.format(name=name)
        results = web_search(query, max_results=3)
        for r in results:
            collected.append(r)
            if r["url"] not in sources:
                sources.append(r["url"])

    for r in collected[:2]:
        if r["url"]:
            try:
                extracted = web_fetch(r["url"])
                if extracted:
                    r["content"] = extracted[:2000]
            except Exception:
                pass

    context = "\n\n".join(f"[{r['title']}]({r['url']})\n{r['content']}" for r in collected)

    prompt = f"""Research the competitor: {name}

Gathered data:
{context}

Synthesize into structured competitor intel.
Respond with valid JSON matching this exact schema:
{{
  "name": "{name}",
  "pricing_notes": "string - what they charge, tiers, free options",
  "positioning": "string - how they position themselves, target audience, USP",
  "recent_activity": ["string", "..."] - recent news, launches, updates,
  "review_sentiment_summary": "string - what users generally say",
  "sources": ["url", "..."] - URLs of sources used
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


class CompetitorOutput(BaseModel):
    name: str
    pricing_notes: str = "Not discoverable from public sources"
    positioning: str = "Not discoverable from public sources"
    recent_activity: list[str] = Field(default_factory=list)
    review_sentiment_summary: str = "Not discoverable from public sources"
    sources: list[str] = Field(default_factory=list)


class CompetitorReconOutput(BaseModel):
    competitors: list[CompetitorOutput] = Field(default_factory=list)


def run(
    tenant_id: str,
    business_description: str,
    run_id: str,
    known_competitors: list[str] | None = None,
) -> dict[str, Any]:
    ensure_tenant(tenant_id, business_description)

    if not known_competitors:
        known_competitors = _discover_competitors(business_description)

    known_competitors = known_competitors[:3]

    competitors = []
    all_sources: list[str] = []
    for name in known_competitors:
        try:
            raw = _research_competitor(name)
            validated = CompetitorOutput(**raw)
            competitors.append(validated)
            for s in validated.sources:
                if s not in all_sources:
                    all_sources.append(s)
        except Exception as e:
            competitors.append(
                CompetitorOutput(
                    name=name,
                    pricing_notes=f"Error researching: {e}",
                )
            )

    output = CompetitorReconOutput(competitors=competitors)

    embedding_text = json.dumps(output.model_dump())
    embedding = get_embedding(embedding_text)

    store_finding(
        tenant_id=tenant_id,
        run_id=run_id,
        agent_type="competitor_recon",
        content=output.model_dump(),
        embedding=embedding,
    )

    return output.model_dump()
