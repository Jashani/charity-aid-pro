"""Scoring pipeline for extracted funding opportunities.

Stages, in order, per opportunity:

1. Geography gate — LLM with keyword fallback.
   Hard-fail short-circuits all further processing.

2. Eligibility gate — LLM with keyword fallback.
   Checks whether the opportunity fits M4W's themes (music, arts, wellbeing,
   older people, mental health, disability, isolation, etc.).
   Hard-fail short-circuits scoring — only clearly irrelevant opportunities
   are rejected; uncertain cases default to pass=true for human review.

3. Heuristic scores — funding value, strategic fit, effort, probability,
   strategic value — combined into a weighted final score (0–100).
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


# ── Eligibility ───────────────────────────────────────────────────────────────

# Aligned with the charity's own keyword list plus common synonyms.
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

# High-confidence sector exclusions used only in the keyword fallback (when the
# LLM eligibility call is unavailable). Matched case-insensitively against the
# combined funder name + programme name + description text.
# Keep this list short and conservative — the primary LLM call handles nuance.
SECTOR_HARD_FAIL = (
    "forestry", "tree planting", "rewilding", "ecology", "biodiversity",
    "recycling",
    "asylum seeker", "refugee",
    "armed forces",
)


def _eligibility_keyword_fallback(opp: FundingOpportunity) -> dict[str, Any]:
    """Heuristic fallback used only when the LLM eligibility call errors."""
    text = f"{opp.funder_name} {opp.program_name} {opp.description}".lower()
    original = f"{opp.funder_name} {opp.program_name} {opp.description}"

    # STEM must be checked case-sensitively to avoid substring noise ("system",
    # "eastern", etc.).
    if "STEM" in original:
        return {
            "pass": False,
            "confidence": 0.8,
            "reasoning": "Keyword fallback: STEM education sector",
        }

    for pattern in SECTOR_HARD_FAIL:
        if pattern in text:
            return {
                "pass": False,
                "confidence": 0.75,
                "reasoning": f"Keyword fallback: sector mismatch ({pattern})",
            }

    hits = sum(1 for kw in ELIGIBILITY_KEYWORDS if kw in text)
    # Default to pass=true when LLM is unavailable — prefer false positives over
    # false negatives. A human reviewer will see the opportunity regardless.
    return {
        "pass": True,
        "confidence": round(min(hits / 10, 0.8), 2) if hits else 0.2,
        "reasoning": f"LLM unavailable — keyword fallback ({hits} keyword hits)",
    }


def _eligibility_with_llm(opp: FundingOpportunity) -> dict[str, Any]:
    """Primary eligibility gate: LLM semantic check with keyword fallback."""
    text = f"{opp.funder_name} — {opp.program_name}: {opp.description}"
    prompt = f"""You are screening a grant for Music4Wellbeing (M4W), a Kent charity running \
participatory music, singing, and creative arts for isolated older adults, people with \
disabilities, and those with poor mental health.

Opportunity: {text}

Return JSON only:
{{"pass": true | false, "confidence": 0.0-1.0, "reasoning": "<one sentence>"}}

pass=true if related to: music, arts, singing, dance, creative activities, wellbeing, \
mental health, older people, ageing, dementia, Parkinson's, stroke, isolation, loneliness, \
carers, disability, neurodiversity, intergenerational activities, therapeutic work, \
disadvantaged communities, or broadly applicable community health/social funding.

pass=false only if clearly in a different sector: natural environment/ecology/forestry/\
tree planting, building or property repair, children's schools education, STEM, \
legal/asylum/migration, electrical recycling, animal welfare, armed forces, or \
sport/recreation facilities.

When uncertain, return pass=true — a human reviewer will decide.
"""
    try:
        raw = _chat(prompt, stage="eligibility")
        data = _parse_json(raw, stage="eligibility")
        if not isinstance(data, dict) or "pass" not in data:
            raise LLMError("eligibility: missing 'pass'")
        data.setdefault("reasoning", "")
        data.setdefault("confidence", 0.5)
        return {
            "pass": bool(data["pass"]),
            "confidence": float(data["confidence"]),
            "reasoning": data["reasoning"],
        }
    except Exception as exc:
        logger.warning("Eligibility LLM call failed (%s) — using keyword fallback", exc)
        return _eligibility_keyword_fallback(opp)


# ── Internal score helpers ────────────────────────────────────────────────────

def _funding_value_score(amount: float, amount_max: float | None) -> tuple[int, float]:
    """Returns (internal_score, amount_used). Only amount_used is persisted."""
    value = amount_max if amount_max is not None else amount
    if value >= 30_000:
        return 10, value
    if value >= 15_000:
        return 9, value
    if value >= 5_000:
        return 7, value
    if value >= 2_000:
        return 5, value
    return 3, value


def _timing_score(deadline: str) -> int | None:
    """Urgency score from deadline. Returns None if unknown or expired."""
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


def _heuristic_scores(opp: FundingOpportunity) -> dict[str, dict[str, Any]]:
    """Compute scoring dimensions (strategic fit, effort, probability, strategic value).

    Eligibility is handled upstream by _eligibility_with_llm; this function
    only produces the components that feed into the final weighted score.
    """
    # Check across all three text fields for better keyword coverage.
    text = f"{opp.funder_name} {opp.program_name} {opp.description}".lower()
    funder_type = opp.type
    amount_max = opp.amount_max if opp.amount_max is not None else opp.amount

    hits = sum(1 for kw in ELIGIBILITY_KEYWORDS if kw in text)
    strategic_fit = max(1, min(hits * 2, 10))

    if re.search(r"\b(eoi|expression of interest|short form|simple application|one-page)\b", text):
        effort = 9
    elif re.search(r"\b(full application|detailed proposal|business plan|theory of change|logic model)\b", text):
        effort = 3
    elif funder_type == "government":
        effort = 3
    elif funder_type == "trust":
        effort = 7
    else:
        effort = 5

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

    strategic_value = 3
    if opp.duration_months >= 24:
        strategic_value += 3
    if any(s in text for s in ("partnership", "collaboration", "consortium")):
        strategic_value += 2
    if any(s in text for s in ("core", "unrestricted")):
        strategic_value += 2
    strategic_value = min(strategic_value, 10)

    return {
        "strategic_fit": {
            "score": strategic_fit,
            "reasoning": f"Matched {hits} M4W keywords across name and description",
        },
        "effort": {"score": effort, "reasoning": "Inferred from description / funder type"},
        "probability": {"score": probability, "reasoning": "From grant size band"},
        "strategic_value": {"score": strategic_value, "reasoning": "From duration / purpose"},
    }


# ── Pipeline entry point ──────────────────────────────────────────────────────

def score_opportunity(opp: FundingOpportunity) -> FundingOpportunity:
    """Run gating + scoring on *opp*, mutate it in place, and return it."""

    # 1. Geography gate
    geo = _geography_with_llm(opp.location)
    if not geo["pass"]:
        opp.gating = {
            "status": "failed",
            "geography": {"pass": False, "reasoning": geo.get("reasoning", "")},
            "eligibility": {"pass": False, "confidence": 0, "reasoning": "Skipped — geography hard fail"},
        }
        opp.scored_at = datetime.now(timezone.utc)
        return opp

    # 2. Eligibility gate
    elig = _eligibility_with_llm(opp)
    if not elig["pass"]:
        opp.gating = {
            "status": "failed",
            "geography": {"pass": True, "reasoning": geo.get("reasoning", "")},
            "eligibility": {
                "pass": False,
                "confidence": elig.get("confidence", 0),
                "reasoning": elig.get("reasoning", ""),
            },
        }
        opp.scored_at = datetime.now(timezone.utc)
        return opp

    # 3. Heuristic scoring — only reached when both gates pass
    heur = _heuristic_scores(opp)
    fv_score, fv_amount = _funding_value_score(opp.amount, opp.amount_max)
    timing_score = _timing_score(opp.deadline)

    sf_score = heur["strategic_fit"]["score"]
    effort = heur["effort"]["score"]
    probability = heur["probability"]["score"]
    strategic_value = heur["strategic_value"]["score"]

    final_score = round(
        (
            sf_score * 0.30
            + fv_score * 0.35
            + probability * 0.15
            + strategic_value * 0.15
            + effort * 0.05
        )
        * 10,
        1,
    )

    suggested: list[str] = []
    if effort >= 8 and (timing_score or 0) >= 8:
        suggested.append("Quick Win")
    if opp.duration_months >= 24:
        suggested.append("Multi-Year")
    if sf_score >= 8 and probability >= 7:
        suggested.append("Strong Match")
    if fv_score >= 9:
        suggested.append("High Value")

    opp.gating = {
        "status": "passed",
        "geography": {"pass": True, "reasoning": geo.get("reasoning", "")},
        "eligibility": {
            "pass": True,
            "confidence": elig.get("confidence", 0.5),
            "reasoning": elig.get("reasoning", ""),
        },
    }
    opp.scores = {
        "strategic_fit": {"score": sf_score, "reasoning": heur["strategic_fit"]["reasoning"]},
        "funding_value": {"amount_used": fv_amount},
        "probability": heur["probability"],
        "effort": heur["effort"],
        "strategic_value": heur["strategic_value"],
    }
    opp.final_score = final_score
    opp.score = final_score
    opp.tags = sorted(set(opp.tags + suggested))
    opp.scored_at = datetime.now(timezone.utc)
    return opp


def score_all(opportunities: list[FundingOpportunity]) -> list[FundingOpportunity]:
    return [score_opportunity(o) for o in opportunities]
