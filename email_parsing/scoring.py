"""Scoring pipeline for extracted funding opportunities.

Stages, in order, per opportunity:

1. Geography gate — LLM with keyword fallback.
   Hard-fail short-circuits all further processing.

2. Combined eligibility + scoring — single LLM call with keyword fallback.
   Returns pass/fail and a 0–100 score based on mission alignment and value.
   pass=false (score < 20 or clearly ineligible) → opportunity dismissed.
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timezone
from typing import Any

from .llm import LLMError, _chat, _parse_json
from .schema import FundingOpportunity


logger = logging.getLogger(__name__)


# ── Geography ────────────────────────────────────────────────────────────────

KENT_AREAS = [
    "canterbury", "dover", "medway", "thanet", "swale", "gravesham",
    "dartford", "maidstone", "ashford", "folkestone", "tonbridge",
    "sevenoaks", "tunbridge wells", "shepway",
]
GEO_PASS_TERMS = (
    "kent", "south east", "southeast", "england", "uk", "united kingdom",
    "britain", "nationwide", "national",
)
GEO_FAIL_TERMS = [
    "scotland", "wales", "northern ireland", "greater manchester",
    "liverpool", "birmingham", "yorkshire", "cornwall",
]


def _geography_keyword_fallback(location: str) -> dict[str, Any]:
    loc = (location or "").lower().strip()

    if any(t in loc for t in GEO_FAIL_TERMS):
        return {"pass": False, "reasoning": "Out-of-area keyword match"}

    if not loc or loc in {"unknown", "n/a", "not specified", "unspecified"}:
        return {"pass": True, "reasoning": "Location unspecified — assumed eligible"}

    if any(t in loc for t in KENT_AREAS) or any(t in loc for t in GEO_PASS_TERMS):
        return {"pass": True, "reasoning": "Kent-eligible location"}

    return {"pass": True, "reasoning": "No exclusion match — assumed eligible"}


def _geography_with_llm(location: str) -> dict[str, Any]:
    prompt = f"""You are assessing geographic eligibility for a charity based in Kent, England.

Grant location/geographic scope: "{location}"

Return JSON only:
{{
  "pass": true | false,
  "reasoning": "<one sentence>"
}}

Rules:
- pass=true if the location includes Kent (e.g. Kent, South East, England,
  UK-wide, nationwide) OR if the location is unspecified.
- pass=false ONLY when explicitly restricted to a region that excludes Kent
  (Scotland, Wales, Northern Ireland, West Midlands, etc.).
"""
    try:
        raw = _chat(prompt, stage="geography")
        data = _parse_json(raw, stage="geography")
        if not isinstance(data, dict) or "pass" not in data:
            raise LLMError("geography: missing 'pass'")
        data.setdefault("reasoning", "")
        return {"pass": bool(data["pass"]), "reasoning": data["reasoning"]}
    except Exception as exc:
        logger.warning("Geography LLM call failed (%s) — using keyword fallback", exc)
        return _geography_keyword_fallback(location)


# ── Combined eligibility + scoring ───────────────────────────────────────────

# Keyword lists retained for the fallback path only.
ELIGIBILITY_KEYWORDS = (
    "accessible", "accessibility",
    "age", "ageing", "aging", "older people", "older adults", "later life",
    "ageing well", "healthy ageing",
    "art", "arts", "creative", "creativity",
    "bereavement",
    "care", "carer", "carers", "caring",
    "community", "connection", "belonging",
    "creative health",
    "dementia",
    "deprivation", "disadvantage", "disadvantaged", "deprived",
    "disability", "disabled",
    "emotional", "emotion",
    "health", "wellbeing", "well-being",
    "intergenerational",
    "isolation", "loneliness", "lonely",
    "inclusive", "inclusion", "marginalised", "marginalized",
    "mental health",
    "music", "singing", "song", "choir", "dance",
    "neurological", "neurodiversity", "neurodivergent",
    "non-clinical",
    "parkinson", "stroke",
    "participatory",
    "respiratory", "breathing",
    "small charities", "small charity",
    "social prescribing",
    "therapeutic", "therapy",
    "vulnerable", "vulnerable adults",
)

SECTOR_HARD_FAIL = (
    "forestry", "tree planting", "rewilding", "ecology", "biodiversity",
    "recycling",
    "asylum seeker", "refugee",
    "armed forces",
)


def _score_keyword_fallback(opp: FundingOpportunity) -> dict[str, Any]:
    """Fallback used only when the LLM scoring call errors."""
    text = f"{opp.funder_name} {opp.program_name} {opp.description}"
    text_lower = text.lower()

    if "STEM" in text:
        return {"pass": False, "score": 5, "reasoning": "Keyword fallback: STEM education sector"}

    for pattern in SECTOR_HARD_FAIL:
        if pattern in text_lower:
            return {"pass": False, "score": 5, "reasoning": f"Keyword fallback: sector mismatch ({pattern})"}

    hits = sum(1 for kw in ELIGIBILITY_KEYWORDS if kw in text_lower)
    score = min(hits * 8, 40)
    return {
        "pass": True,
        "score": score,
        "reasoning": f"LLM unavailable — keyword fallback ({hits} keyword hits)",
    }


def _score_with_llm(opp: FundingOpportunity) -> dict[str, Any]:
    """Single LLM call: eligibility gate + 0–100 mission-alignment score."""
    amount_str = f"£{opp.amount:,.0f}"
    if opp.amount_max and opp.amount_max > opp.amount:
        amount_str += f"–£{opp.amount_max:,.0f}"

    text = f"{opp.funder_name} — {opp.program_name}: {opp.description}"

    prompt = f"""Score this grant for Music4Wellbeing (M4W), a Kent charity whose mission is: \
"For the public benefit in South East England, the relief of those in need by reason of \
physical and/or mental ill health, disability or age, including people with neurodegenerative \
conditions such as dementia and Parkinson's, and their carers through providing specifically \
designed, group therapeutic music sessions and associated activities led by experienced \
therapeutic arts practitioners."

Opportunity: {text}
Award: {amount_str}

Scoring rubric (0–100 integer):
0–19  — Ineligible or no alignment. Wrong sector (environment/ecology, STEM, sport \
facilities, legal/asylum, animal welfare, armed forces, building repair). Charity \
clearly cannot apply. Set pass=false — will be auto-dismissed.
20–39 — Weak alignment. Vaguely related or broadly applicable but poor mission fit. \
Eligible but overlap is peripheral. Low value or highly restrictive terms.
40–59 — Moderate alignment. Eligible; mission broadly matches — overlaps M4W's \
activities (music, arts, wellbeing) OR beneficiaries (older adults, disability, \
mental health) but not strongly both. Modest value (under £10,000).
60–79 — Good alignment. Clearly eligible. Meaningful overlap with M4W's core work \
(participatory music, therapeutic arts) or specific beneficiaries (older adults, \
dementia, Parkinson's, carers, disability, isolation). Reasonable value (£10,000–£30,000).
80–100 — Excellent, specific alignment. Strong fit with M4W's exact mission — funder \
seeks therapeutic music/arts for older adults or people with disability/mental ill health. \
Charity is a strong candidate. High value (£30,000+) or significant strategic value.

Set pass=false if score ≤ 19 or charity is clearly ineligible regardless of score.

Return JSON only: {{"pass": true|false, "score": <integer 0-100>, "reasoning": "<one sentence>"}}"""

    try:
        raw = _chat(prompt, stage="score")
        data = _parse_json(raw, stage="score")
        if not isinstance(data, dict) or "pass" not in data or "score" not in data:
            raise LLMError("score: missing required fields")
        data.setdefault("reasoning", "")
        score = max(0, min(100, int(data["score"])))
        passed = bool(data["pass"])
        if score < 20:
            passed = False
        return {"pass": passed, "score": score, "reasoning": data["reasoning"]}
    except Exception as exc:
        logger.warning("Score LLM call failed (%s) — using keyword fallback", exc)
        return _score_keyword_fallback(opp)


# ── Timing helper (used for tags only) ───────────────────────────────────────

def _timing_score(deadline: str) -> int | None:
    if not deadline or deadline == "unknown":
        return None
    try:
        deadline_date = datetime.fromisoformat(deadline).date()
    except ValueError:
        return None
    days = (deadline_date - date.today()).days
    if days < 0:
        return None
    if days < 7:
        return 10
    if days < 30:
        return 8
    if days < 90:
        return 6
    if days < 180:
        return 4
    return 2


# ── Pipeline entry point ──────────────────────────────────────────────────────

def score_opportunity(opp: FundingOpportunity) -> FundingOpportunity:
    """Run gating + scoring on *opp*, mutate it in place, and return it."""

    # 1. Geography gate
    geo = _geography_with_llm(opp.location)
    if not geo["pass"]:
        opp.gating = {
            "status": "failed",
            "geography": {"pass": False, "reasoning": geo.get("reasoning", "")},
            "score": {"pass": False, "score": 0, "reasoning": "Skipped — geography hard fail"},
        }
        opp.score = 0.0
        opp.final_score = 0.0
        opp.scored_at = datetime.now(timezone.utc)
        return opp

    # 2. Combined eligibility + scoring
    result = _score_with_llm(opp)
    if not result["pass"]:
        opp.gating = {
            "status": "failed",
            "geography": {"pass": True, "reasoning": geo.get("reasoning", "")},
            "score": result,
        }
        opp.score = 0.0
        opp.final_score = 0.0
        opp.dismissal_reason = result.get("reasoning", "")
        opp.status = "dismissed"
        opp.scored_at = datetime.now(timezone.utc)
        return opp

    # 3. Post-scoring tags — pure heuristics, no LLM
    timing = _timing_score(opp.deadline)
    text = f"{opp.funder_name} {opp.program_name} {opp.description}".lower()
    amount_max = opp.amount_max if opp.amount_max is not None else opp.amount

    suggested: list[str] = []
    if (timing or 0) >= 8 and re.search(
        r"\b(eoi|expression of interest|short form|simple application|one-page)\b", text
    ):
        suggested.append("Quick Win")
    if opp.duration_months >= 24:
        suggested.append("Multi-Year")
    if result["score"] >= 80:
        suggested.append("Strong Match")
    if amount_max >= 30_000:
        suggested.append("High Value")

    opp.gating = {
        "status": "passed",
        "geography": {"pass": True, "reasoning": geo.get("reasoning", "")},
        "score": result,
    }
    opp.scores = {
        "mission_alignment": {
            "score": result["score"],
            "reasoning": result["reasoning"],
        }
    }
    opp.score = float(result["score"])
    opp.final_score = float(result["score"])
    opp.tags = sorted(set(opp.tags + suggested))
    opp.scored_at = datetime.now(timezone.utc)
    return opp


def score_all(opportunities: list[FundingOpportunity]) -> list[FundingOpportunity]:
    return [score_opportunity(o) for o in opportunities]
