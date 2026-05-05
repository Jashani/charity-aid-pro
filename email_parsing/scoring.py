"""Scoring pipeline for extracted funding opportunities.

Stages, in order, per opportunity:

1. Gating
   - extraction confidence (algorithmic)
   - geography (LLM with keyword fallback)
   - eligibility (heuristic on description/eligibility text)
   Geography hard-fail short-circuits — no further scoring.

2. Algorithmic + heuristic scores
   - funding value, timing, geography modifier
   - eligibility / strategic_fit / effort / probability / strategic_value heuristics

3. Weighted final score (0-100) and suggested tags.

The non-geography heuristics are deliberately keyword-based for now (Phase 1).
Replace `_heuristic_scores` with a single LLM call to upgrade.
"""

from __future__ import annotations

import json
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
GEO_FAIL_TERMS = [
    "scotland", "wales", "northern ireland", "greater manchester",
    "liverpool", "birmingham", "yorkshire", "cornwall",
]


def _geography_keyword_fallback(location: str) -> dict[str, Any]:
    loc = (location or "").lower().strip()

    if any(t in loc for t in GEO_FAIL_TERMS):
        return {"pass": False, "specificity": None, "reasoning": "Out-of-area keyword match"}

    if not loc or loc in {"unknown", "n/a", "not specified", "unspecified"}:
        return {"pass": True, "specificity": "unknown", "reasoning": "Location unspecified"}

    if any(t in loc for t in KENT_AREAS) or "kent" in loc:
        spec = "kent_only"
    elif any(t in loc for t in ("south east", "southeast", "regional")):
        spec = "uk_regional"
    elif any(t in loc for t in ("nationwide", "national", "england", "uk")):
        spec = "uk_wide"
    else:
        spec = "unknown"

    return {"pass": True, "specificity": spec, "reasoning": "Keyword match"}


def _geography_with_llm(location: str) -> dict[str, Any]:
    prompt = f"""You are assessing geographic eligibility for a charity based in Kent, England.

Grant location/geographic scope: "{location}"

Return JSON only:
{{
  "pass": true | false,
  "specificity": "kent_only" | "uk_regional" | "uk_wide" | "unknown" | null,
  "reasoning": "<one sentence>"
}}

Rules:
- pass=true if Kent-based orgs are eligible OR location is unspecified.
- pass=false ONLY when explicitly restricted to a region that excludes Kent
  (Scotland, Wales, NI, West Midlands, etc.).
- specificity=null only when pass=false.
"""
    try:
        raw = _chat(prompt, stage="geography")
        data = _parse_json(raw, stage="geography")
        if not isinstance(data, dict) or "pass" not in data:
            raise LLMError("geography: missing 'pass'")
        data.setdefault("specificity", "unknown")
        data.setdefault("reasoning", "")
        return data
    except Exception as exc:
        logger.warning("Geography LLM call failed (%s) — using keyword fallback", exc)
        return _geography_keyword_fallback(location)


# ── Algorithmic scores ───────────────────────────────────────────────────────

def _funding_value_score(amount: float, amount_max: float | None) -> tuple[int, float]:
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


def _timing_score(deadline: str) -> tuple[int | None, int | None]:
    """Returns (score, days_to_deadline). None if unknown or expired."""
    if not deadline or deadline == "unknown":
        return None, None
    try:
        deadline_date = datetime.fromisoformat(deadline).date()
    except ValueError:
        return None, None
    days = (deadline_date - date.today()).days
    if days < 0:
        return None, days
    if days < 7:
        return 10, days
    if days < 30:
        return 8, days
    if days < 90:
        return 6, days
    if days < 180:
        return 4, days
    return 2, days


_GEO_MODIFIER = {
    "kent_only": 1.10,
    "uk_regional": 1.05,
    "uk_wide": 1.00,
    "unknown": 1.00,
}


# ── Heuristic scores (placeholder for full LLM scoring) ──────────────────────

ELIGIBILITY_KEYWORDS = (
    "wellbeing", "older people", "elderly", "isolation", "loneliness",
    "community", "disability", "arts", "music", "mental health",
    "social prescribing",
)


def _heuristic_scores(opp: FundingOpportunity) -> dict[str, dict[str, Any]]:
    text = f"{opp.description} {opp.eligibility}".lower()
    funder_type = opp.type
    amount_max = opp.amountMax if opp.amountMax is not None else opp.amount

    hits = sum(1 for kw in ELIGIBILITY_KEYWORDS if kw in text)
    eligibility_pass = hits > 0
    eligibility_confidence = round(min(hits / len(ELIGIBILITY_KEYWORDS), 1.0), 2)

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
    if opp.duration == "multi-year" or opp.durationMonths >= 24:
        strategic_value += 3
    if any(s in text for s in ("partnership", "collaboration", "consortium")):
        strategic_value += 2
    if any(s in text for s in ("core", "unrestricted")):
        strategic_value += 2
    strategic_value = min(strategic_value, 10)

    return {
        "eligibility": {
            "pass": eligibility_pass,
            "confidence": eligibility_confidence,
            "reasoning": f"Matched {hits}/{len(ELIGIBILITY_KEYWORDS)} M4W keywords",
        },
        "strategic_fit": {"score": strategic_fit, "reasoning": "Keyword match on M4W themes"},
        "effort": {"score": effort, "reasoning": "Inferred from description / funder type"},
        "probability": {"score": probability, "reasoning": "From grant size band"},
        "strategic_value": {"score": strategic_value, "reasoning": "From duration / purpose"},
    }


# ── Pipeline entry point ─────────────────────────────────────────────────────

def score_opportunity(opp: FundingOpportunity) -> FundingOpportunity:
    """Run gating + scoring on *opp*, mutate it in place, and return it."""
    extraction_pass = opp.extractionConfidence >= 0.5
    geo = _geography_with_llm(opp.location)
    geo_pass: bool = bool(geo["pass"])
    geo_specificity: str | None = geo.get("specificity")

    if not geo_pass:
        opp.gating = {
            "status": "failed",
            "extraction_confidence": {"pass": extraction_pass},
            "eligibility": {"pass": False, "confidence": 0.0, "reasoning": "Skipped — geography hard fail"},
            "geography": {"pass": False, "specificity": None, "reasoning": geo.get("reasoning", "")},
        }
        opp.scored_at = datetime.now(timezone.utc)
        return opp

    heur = _heuristic_scores(opp)
    eligibility_pass = bool(heur["eligibility"]["pass"])
    geo_unknown = geo_specificity in (None, "unknown")
    any_failed = not (extraction_pass and eligibility_pass)

    if any_failed or geo_unknown:
        gating_status = "needs_review"
    else:
        gating_status = "passed"

    fv_score, fv_amount = _funding_value_score(opp.amount, opp.amountMax)
    timing_score, days_to_deadline = _timing_score(opp.deadline)
    geo_modifier = _GEO_MODIFIER.get(geo_specificity or "unknown", 1.00)

    sf_raw = heur["strategic_fit"]["score"]
    sf_final = round(min(sf_raw * geo_modifier, 10), 2)
    effort = heur["effort"]["score"]
    probability = heur["probability"]["score"]
    strategic_value = heur["strategic_value"]["score"]

    final_score = round(
        (
            sf_final * 0.30
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
    if opp.duration == "multi-year":
        suggested.append("Multi-Year")
    if sf_final >= 8 and probability >= 7:
        suggested.append("Strong Match")
    if fv_score >= 9:
        suggested.append("High Value")

    opp.gating = {
        "status": gating_status,
        "extraction_confidence": {"pass": extraction_pass},
        "eligibility": heur["eligibility"],
        "geography": {
            "pass": True,
            "specificity": geo_specificity,
            "reasoning": geo.get("reasoning", ""),
        },
    }
    opp.scores = {
        "strategic_fit": {"raw": sf_raw, "final": sf_final, "reasoning": heur["strategic_fit"]["reasoning"]},
        "funding_value": {"score": fv_score, "amount_used": fv_amount},
        "probability": heur["probability"],
        "effort": heur["effort"],
        "strategic_value": heur["strategic_value"],
    }
    opp.timing = {"score": timing_score, "days_to_deadline": days_to_deadline}
    opp.final_score = final_score
    opp.score = final_score
    opp.suggested_tags = suggested
    opp.tags = sorted(set(opp.tags + suggested))
    opp.scored_at = datetime.now(timezone.utc)
    return opp


def score_all(opportunities: list[FundingOpportunity]) -> list[FundingOpportunity]:
    return [score_opportunity(o) for o in opportunities]
