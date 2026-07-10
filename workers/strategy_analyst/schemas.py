from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Input schemas  (shape of Agent 1's output + pattern library)
# ---------------------------------------------------------------------------

class ClientInfo(BaseModel):
    name: str
    description: str
    current_pricing: str
    features: list[str]
    target_audience: str


class Competitor(BaseModel):
    name: str
    pricing: str
    strengths: list[str]
    weaknesses: list[str]
    market_share: str | None = None


class MarketData(BaseModel):
    industry: str
    market_size: str
    growth_rate: str
    trends: list[str]


class Pattern(BaseModel):
    name: str
    description: str


class Agent2Input(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    client: ClientInfo
    competitors: list[Competitor]
    market: MarketData
    user_sentiment: list[str] = Field(default_factory=list)
    patterns: list[Pattern]


# ---------------------------------------------------------------------------
# Output schemas  (analysis + strategy)
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
    pattern: str = Field(description="Must match a pattern name from the provided library")
    description: str
    cites: str = Field(description="Must reference the title of an opportunity or threat from the analysis")
    expected_impact: str


class Agent2Output(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    analysis: Analysis
    strategy: list[StrategyItem]
