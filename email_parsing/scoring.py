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


_ACTIVITY_KEYWORDS = (
    "music", "singing", "song", "choir", "dance", "art", "arts", "creative",
    "creativity", "therapeutic", "therapy", "participatory", "social prescribing",
    "creative health",
)
_AUDIENCE_KEYWORDS = (
    "dementia", "parkinson", "older people", "older adults", "ageing", "aging",
    "later life", "mental health", "disability", "disabled", "carer", "carers",
    "caring", "vulnerable", "vulnerable adults", "neurological", "neurodiversity",
    "stroke", "isolation", "loneliness", "ill health",
)


def _score_keyword_fallback(opp: FundingOpportunity) -> dict[str, Any]:
    """Fallback used only when the LLM scoring call errors."""
    text = f"{opp.funder_name} {opp.program_name} {opp.description}"
    text_lower = text.lower()

    if "STEM" in text:
        return {"pass": False, "activity_score": 5, "audience_score": 5, "final_score": 5,
                "reasoning": "Keyword fallback: STEM education sector"}

    for pattern in SECTOR_HARD_FAIL:
        if pattern in text_lower:
            return {"pass": False, "activity_score": 5, "audience_score": 5, "final_score": 5,
                    "reasoning": f"Keyword fallback: sector mismatch ({pattern})"}

    activity_hits = sum(1 for kw in _ACTIVITY_KEYWORDS if kw in text_lower)
    audience_hits = sum(1 for kw in _AUDIENCE_KEYWORDS if kw in text_lower)
    activity_score = min(activity_hits * 10, 40)
    audience_score = min(audience_hits * 10, 40)
    final = round(activity_score * 0.4 + audience_score * 0.6)
    return {
        "pass": True,
        "activity_score": activity_score,
        "audience_score": audience_score,
        "final_score": final,
        "reasoning": f"LLM unavailable — keyword fallback (activity: {activity_hits}, audience: {audience_hits})",
    }


def _score_with_llm(opp: FundingOpportunity) -> dict[str, Any]:
    """Single LLM call: eligibility gate + two-dimension mission-alignment score."""
    amount_str = f"£{opp.amount:,.0f}"
    if opp.amount_max and opp.amount_max > opp.amount:
        amount_str += f"–£{opp.amount_max:,.0f}"

    text = f"{opp.funder_name} — {opp.program_name}: {opp.description}"

    prompt = f"""Score this grant for Music4Wellbeing (M4W), a Kent charity providing group \
therapeutic music sessions and associated activities for people in need due to physical or \
mental ill health, disability, or age — including dementia, Parkinson's, and their carers.

Opportunity: {text}
Award: {amount_str}

Score on TWO dimensions (0–100 integer each):

ACTIVITY ALIGNMENT — how well does this match "group therapeutic music sessions and \
associated creative activities led by experienced practitioners"?
0–19: Wrong sector entirely (STEM, building repair, legal/asylum, sport facilities, \
tax/financial advice, ecology)
20–39: Vaguely arts/creative but not therapeutic or participatory in nature
40–59: Broadly music/arts/creative with some wellbeing angle, not specifically \
therapeutic or group-based
60–79: Music, singing, or creative arts with clear therapeutic or community wellbeing focus
80–100: Specifically therapeutic/participatory music or arts — group sessions, \
practitioner-led, or directly matches M4W's activity model

AUDIENCE ALIGNMENT — how well does this match "people in need due to ill health, \
disability or age — dementia, Parkinson's, and their carers"?
0–19: Wrong audience (professionals, healthy general public, schools, animals)
20–39: Open community grants with no focus on vulnerable or marginalised groups
40–59: Some vulnerability focus (e.g. deprivation, social isolation) but not \
specifically health/age/disability
60–79: Targets mental health, older people, disability, carers, loneliness, or similar
80–100: Specifically targets dementia, Parkinson's, older adults with health needs, \
physical/mental ill health, disability, or carers

Final score = activity×40% + audience×60%. Set pass=false if final score < 20 or \
charity is clearly ineligible.

Return JSON only: \
{{"pass": true|false, "activity_score": <0-100>, "audience_score": <0-100>, \
"reasoning": "<one sentence covering both dimensions>"}}"""

    try:
        raw = _chat(prompt, stage="score")
        data = _parse_json(raw, stage="score")
        if not isinstance(data, dict) or "pass" not in data \
                or "activity_score" not in data or "audience_score" not in data:
            raise LLMError("score: missing required fields")
        data.setdefault("reasoning", "")
        activity = max(0, min(100, int(data["activity_score"])))
        audience = max(0, min(100, int(data["audience_score"])))
        final = round(activity * 0.4 + audience * 0.6)
        passed = bool(data["pass"])
        if final < 20:
            passed = False
        return {
            "pass": passed,
            "activity_score": activity,
            "audience_score": audience,
            "final_score": final,
            "reasoning": data["reasoning"],
        }
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
            "score": {"pass": False, "activity_score": 0, "audience_score": 0,
                      "final_score": 0, "reasoning": "Skipped — geography hard fail"},
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
            "score": {
                "pass": False,
                "activity_score": result["activity_score"],
                "audience_score": result["audience_score"],
                "final_score": result["final_score"],
                "reasoning": result["reasoning"],
            },
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
    if result["final_score"] >= 80:
        suggested.append("Strong Match")
    if amount_max >= 30_000:
        suggested.append("High Value")

    opp.gating = {
        "status": "passed",
        "geography": {"pass": True, "reasoning": geo.get("reasoning", "")},
        "score": {
            "pass": True,
            "activity_score": result["activity_score"],
            "audience_score": result["audience_score"],
            "final_score": result["final_score"],
            "reasoning": result["reasoning"],
        },
    }
    # reasoning lives in gating.score only — not duplicated here
    opp.scores = {
        "activity_alignment": {"score": result["activity_score"]},
        "audience_alignment": {"score": result["audience_score"]},
    }
    opp.score = float(result["final_score"])
    opp.final_score = float(result["final_score"])
    opp.tags = sorted(set(opp.tags + suggested))
    opp.scored_at = datetime.now(timezone.utc)
    return opp


def score_all(opportunities: list[FundingOpportunity]) -> list[FundingOpportunity]:
    return [score_opportunity(o) for o in opportunities]
