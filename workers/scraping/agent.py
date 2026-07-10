import random
from typing import Any


def run(tenant_id: str, business_description: str, run_id: str) -> dict[str, Any]:
    competitors = [
        "Acme Corp", "Globex Inc", "Initech", "Umbrella Co", "Hooli LLC",
        "Piedmont Ventures", "Stark Industries", "Wayne Enterprises",
    ]

    return {
        "competitor_names": random.sample(competitors, k=random.randint(3, 6)),
        "pricing_models": random.sample(
            ["freemium", "subscription", "one-time", "usage-based", "tiered"],
            k=random.randint(2, 4),
        ),
        "market_trends": random.sample(
            [
                "AI-driven personalization",
                "Sustainability focus",
                "Mobile-first UX",
                "Community-led growth",
                "Price compression",
                "Regulatory scrutiny",
            ],
            k=random.randint(2, 4),
        ),
        "customer_pain_points": random.sample(
            [
                "Too expensive for small teams",
                "Poor onboarding experience",
                "Lack of integrations",
                "Slow customer support",
                "Feature bloat",
                "Unclear pricing",
            ],
            k=random.randint(2, 4),
        ),
        "market_size": round(random.uniform(1_000_000, 50_000_000), 0),
        "growth_rate": round(random.uniform(0.05, 0.30), 2),
        "average_sentiment": round(random.uniform(0.3, 0.9), 2),
    }
