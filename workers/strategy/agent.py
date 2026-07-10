import random
from typing import Any


def run(
    tenant_id: str,
    business_description: str,
    run_id: str,
) -> dict[str, Any]:
    return {
        "positioning": random.choice([
            "Premium quality leader",
            "Best value for money",
            "Innovation-first disruptor",
            "Trusted enterprise partner",
        ]),
        "messaging": random.choice([
            "Simplify complexity",
            "Built for scale",
            "Customer-obsessed",
            "Future-proof your business",
        ]),
        "pricing_recommendation": random.choice([
            "Introduce a freemium tier",
            "Bundle features for higher ARPU",
            "Annual discount to improve retention",
            "Usage-based model for SMB segment",
        ]),
        "recommended_actions": random.sample(
            [
                "Launch retargeting campaign",
                "Revamp onboarding flow",
                "Partner with 3 micro-influencers",
                "Publish competitive comparison page",
                "Run A/B test on pricing page",
            ],
            k=random.randint(2, 4),
        ),
    }
