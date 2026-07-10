import random
from typing import Any


def run(
    tenant_id: str,
    business_description: str,
    run_id: str,
    known_competitors: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "brand_authenticity_score": round(random.uniform(0.4, 0.95), 2),
        "competitive_positioning": random.choice([
            "strong_differentiator",
            "me_too",
            "emerging_player",
            "market_leader",
        ]),
        "messaging_alignment": round(random.uniform(0.3, 0.9), 2),
        "top_complaints": random.sample(
            [
                "Pricing not competitive",
                "Missing key features",
                "Brand not memorable",
                "Poor digital presence",
            ],
            k=random.randint(1, 3),
        ),
        "persona_sentiment": {
            "decision_maker": round(random.uniform(0.3, 0.9), 2),
            "end_user": round(random.uniform(0.3, 0.9), 2),
            "influencer": round(random.uniform(0.3, 0.9), 2),
        },
    }
