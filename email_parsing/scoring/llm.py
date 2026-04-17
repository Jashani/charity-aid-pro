"""
LLM scoring — geography check uses real LLM; other dimensions are Phase 1 mocks.

In Phase 2, replace the body of `score_opportunity_with_llm` with an Azure
OpenAI call using the prompt defined in prompt.md. The function signature
and return shape stay identical.

Single call returns eligibility + all four scoring dimensions.
"""

import json
import os
import re


async def check_geography_with_llm(location: str) -> dict:
    """
    Use the LLM to assess whether a grant's geographic scope is eligible
    for a charity based in Kent, England.

    Returns:
        {
            "pass": bool,
            "specificity": "kent_only" | "uk_regional" | "uk_wide" | "unknown" | null,
            "reasoning": str
        }
    """
    from openai import AzureOpenAI

    client = AzureOpenAI(
        azure_endpoint=os.environ.get("AZURE_OPENAI_ENDPOINT", ""),
        api_key=os.environ.get("AZURE_OPENAI_KEY", ""),
        api_version="2024-10-21",
    )
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")

    prompt = f"""You are assessing geographic eligibility for a charity based in Kent, England.

Grant location/geographic scope: "{location}"

Return JSON only, no other text:
{{
  "pass": true or false,
  "specificity": "kent_only" | "uk_regional" | "uk_wide" | "unknown" | null,
  "reasoning": "one sentence"
}}

Rules:
- pass=true if the grant is open to Kent-based organisations, OR if location is unspecified/unknown (give benefit of the doubt)
- pass=false ONLY if the grant explicitly restricts to a region that excludes Kent (e.g. Scotland-only, Wales-only, West Midlands-only)
- specificity="kent_only" if Kent or nearby areas (Canterbury, Medway, Thanet etc.) are specifically mentioned
- specificity="uk_regional" if South East or a broader region that includes Kent is mentioned
- specificity="uk_wide" if nationwide, England-wide, or UK-wide
- specificity="unknown" if location is unspecified, blank, or unclear
- specificity=null if pass=false (explicitly out of area)"""

    response = client.chat.completions.create(
        model=deployment,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        timeout=30,
    )
    raw = response.choices[0].message.content or ""
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw.strip())
    return json.loads(raw)


ELIGIBILITY_KEYWORDS = [
    "wellbeing", "older people", "elderly", "isolation", "loneliness",
    "community", "disability", "arts", "music", "mental health",
    "social prescribing",
]


async def score_opportunity_with_llm(opportunity: dict) -> dict:
    """
    Single LLM call that returns eligibility gating + four scored dimensions.

    Input: parsed opportunity as a plain dict.
    Output: {
        "eligibility":      {"pass": bool, "confidence": 0.0-1.0, "reasoning": "..."},
        "strategic_fit":    {"score": 0-10, "reasoning": "..."},
        "effort":           {"score": 0-10, "reasoning": "..."},
        "probability":      {"score": 0-10, "reasoning": "..."},
        "strategic_value":  {"score": 0-10, "reasoning": "..."},
    }
    """
    text = (
        f"{opportunity.get('description', '')} {opportunity.get('eligibility', '')}"
    ).lower()
    funder_type = opportunity.get("type", "")
    amount_max = opportunity.get("amountMax") or opportunity.get("amount", 0)
    duration = opportunity.get("duration", "single-year")
    duration_months = opportunity.get("durationMonths", 12)

    # ── Eligibility: keyword match on M4W themes ────────────────────────
    hits = sum(1 for kw in ELIGIBILITY_KEYWORDS if kw in text)
    eligible = hits > 0
    confidence = round(min(hits / len(ELIGIBILITY_KEYWORDS), 1.0), 2)

    # ── Strategic Fit: keyword match on M4W themes ───────────────────────
    strategic_fit = min(max(hits * 2, 1), 10)

    # ── Effort: infer from description text + funder type ────────────────
    low_effort = [
        "eoi", "expression of interest", "short form",
        "simple application", "one-page",
    ]
    high_effort = [
        "full application", "detailed proposal", "business plan",
        "theory of change", "logic model",
    ]
    if any(s in text for s in low_effort):
        effort = 9
    elif any(s in text for s in high_effort):
        effort = 3
    elif funder_type == "government":
        effort = 3
    elif funder_type == "trust":
        effort = 7
    else:
        effort = 5

    # ── Probability: based on grant size (mirrors M4W historical rates) ──
    if amount_max <= 2_000:
        probability = 7
    elif amount_max <= 5_000:
        probability = 5
    elif amount_max <= 15_000:
        probability = 4
    elif amount_max <= 30_000:
        probability = 6
    elif amount_max <= 75_000:
        probability = 2
    else:
        probability = 1

    # ── Strategic Value: multi-year, partnerships, reputation ────────────
    strategic_value = 3
    if duration == "multi-year" or duration_months >= 24:
        strategic_value += 3
    if any(s in text for s in ["partnership", "collaboration", "consortium"]):
        strategic_value += 2
    if any(s in text for s in ["core", "unrestricted"]):
        strategic_value += 2
    strategic_value = min(strategic_value, 10)

    return {
        "eligibility": {
            "pass": eligible,
            "confidence": confidence,
            "reasoning": f"Mock: matched {hits}/{len(ELIGIBILITY_KEYWORDS)} keywords",
        },
        "strategic_fit": {
            "score": strategic_fit,
            "reasoning": "Mock: keyword match",
        },
        "effort": {
            "score": effort,
            "reasoning": "Mock: inferred from description/type",
        },
        "probability": {
            "score": probability,
            "reasoning": "Mock: based on grant size",
        },
        "strategic_value": {
            "score": strategic_value,
            "reasoning": "Mock: based on duration/purpose",
        },
    }
