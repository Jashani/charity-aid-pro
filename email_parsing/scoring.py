"""Scoring pipeline for extracted funding opportunities.

Stages, in order, per opportunity:

1. Gating
   - geography (LLM with keyword fallback) — pass/fail on Kent-area eligibility
   - M4W theme fit (heuristic on description) — flagged 'needs_review' when low
   Geography hard-fail short-circuits — no further scoring.
   (M4W eligibility is determined by the LLM during parsing — opportunities the
   charity is not eligible for are classified IRRELEVANT and never reach scoring.)

2. Heuristic scores
   - funding value (internal, derived from amount)
   - strategic_fit / effort / probability / strategic_value heuristics

3. Weighted final score (0-100) and tag suggestions merged into opp.tags.

The non-geography heuristics are deliberately keyword-based for now (Phase 1).
Replace `_heuristic_scores` with a single LLM call to upgrade.
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

# Locations whose grants are accessible to a Kent-based charity.
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


# ── Internal score helpers ───────────────────────────────────────────────────

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
    """Internal urgency score from the deadline. Returns None if unknown/expired."""
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


# ── Heuristic scores (placeholder for full LLM scoring) ──────────────────────

ELIGIBILITY_KEYWORDS = (
    "wellbeing", "older people", "elderly", "isolation", "loneliness",
    "community", "disability", "arts", "music", "mental health",
    "social prescribing",
)


def _heuristic_scores(opp: FundingOpportunity) -> dict[str, dict[str, Any]]:
    text = opp.description.lower()
    funder_type = opp.type
    amount_max = opp.amount_max if opp.amount_max is not None else opp.amount

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
    if opp.duration_months >= 24:
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
    geo = _geography_with_llm(opp.location)
    geo_pass: bool = bool(geo["pass"])

    if not geo_pass:
        opp.gating = {
            "status": "failed",
            "eligibility": {"pass": False, "confidence": 0.0, "reasoning": "Skipped — geography hard fail"},
            "geography": {"pass": False, "reasoning": geo.get("reasoning", "")},
        }
        opp.scored_at = datetime.now(timezone.utc)
        return opp

    heur = _heuristic_scores(opp)
    eligibility_pass = bool(heur["eligibility"]["pass"])
    gating_status = "passed" if eligibility_pass else "needs_review"

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
        "status": gating_status,
        "eligibility": heur["eligibility"],
        "geography": {"pass": True, "reasoning": geo.get("reasoning", "")},
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
