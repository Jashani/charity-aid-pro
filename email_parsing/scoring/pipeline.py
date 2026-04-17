from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from scoring.algorithmic import get_geography_modifier, score_funding_value, score_timing
from scoring.gating import (
    check_eligibility,
    check_extraction_confidence,
    check_reapplication,
)
from scoring.llm import check_geography_with_llm, score_opportunity_with_llm
from scoring.models import (
    FundingValueScore,
    GatingResult,
    GeographyGate,
    OpportunityInput,
    ReasonedScore,
    ScoredOpportunity,
    ScoresResult,
    StrategicFitScore,
    TimingResult,
)


async def score_opportunity(opp: OpportunityInput) -> ScoredOpportunity:
    """Run the full scoring pipeline on a single opportunity."""

    # ── Stage 1a: Algorithmic gates ──────────────────────────────────────
    extraction = check_extraction_confidence(opp.extractionConfidence)
    reapplication = check_reapplication(opp.relationship.value)

    # ── Stage 1b: LLM geography check (falls back to keyword if LLM fails) ─
    try:
        geo_data = await check_geography_with_llm(opp.location)
        geography = GeographyGate(
            **{"pass": geo_data["pass"]},
            location=opp.location,
            specificity=geo_data.get("specificity"),
        )
    except Exception:
        from scoring.gating import check_geography as _keyword_geography
        geography = _keyword_geography(opp.location)

    # Geography hard fail → explicit out-of-area, skip further LLM calls
    if not geography.pass_:
        eligibility = check_eligibility(
            {"pass": False, "confidence": 0.0, "reasoning": "Not assessed — geography hard fail"}
        )
        gating = GatingResult(
            status="failed",
            extraction_confidence=extraction,
            eligibility=eligibility,
            geography=geography,
            reapplication=reapplication,
        )
        return ScoredOpportunity(
            **opp.model_dump(),
            gating=gating,
            scored_at=datetime.now(timezone.utc),
        )

    llm_result = await score_opportunity_with_llm(opp.model_dump())

    # ── Stage 1c: Resolve gating with LLM eligibility ───────────────────
    eligibility = check_eligibility(llm_result["eligibility"])

    gates = [extraction, eligibility, geography, reapplication]
    any_failed = any(not g.pass_ for g in gates)
    geo_unknown = geography.specificity == "unknown"

    if any_failed:
        gating_status = "needs_review"
    elif geo_unknown:
        gating_status = "needs_review"  # location unspecified — human should confirm
    else:
        gating_status = "passed"
    gating = GatingResult(
        status=gating_status,
        extraction_confidence=extraction,
        eligibility=eligibility,
        geography=geography,
        reapplication=reapplication,
    )

    # ── Stage 2: Algorithmic scores ──────────────────────────────────────
    fv_score, fv_amount = score_funding_value(opp.amount, opp.amountMax)
    timing_score, timing_days = score_timing(opp.deadline)
    geo_modifier = get_geography_modifier(geography.specificity)

    # ── Stage 4: Combine & weight ────────────────────────────────────────
    strategic_fit_raw = llm_result["strategic_fit"]["score"]
    strategic_fit_final = min(strategic_fit_raw * geo_modifier, 10)

    effort_score = llm_result["effort"]["score"]
    probability_score = llm_result["probability"]["score"]
    strategic_value_score = llm_result["strategic_value"]["score"]

    final_score = round(
        (
            strategic_fit_final * 0.30
            + fv_score * 0.35
            + probability_score * 0.15
            + strategic_value_score * 0.15
            + effort_score * 0.05
        )
        * 10,
        1,
    )

    # ── Tag generation ───────────────────────────────────────────────────
    suggested_tags: list[str] = []
    if effort_score >= 8 and timing_score is not None and timing_score >= 8:
        suggested_tags.append("Quick Win")
    if opp.duration == "multi-year":
        suggested_tags.append("Multi-Year")
    if strategic_fit_final >= 8 and probability_score >= 7:
        suggested_tags.append("Strong Match")
    if fv_score >= 9:
        suggested_tags.append("High Value")

    # ── Assemble output ──────────────────────────────────────────────────
    scores = ScoresResult(
        strategic_fit=StrategicFitScore(
            raw=strategic_fit_raw,
            geography_modifier=geo_modifier,
            final=round(strategic_fit_final, 2),
            reasoning=llm_result["strategic_fit"]["reasoning"],
        ),
        funding_value=FundingValueScore(score=fv_score, amount_used=fv_amount),
        probability=ReasonedScore(**llm_result["probability"]),
        effort=ReasonedScore(**llm_result["effort"]),
        strategic_value=ReasonedScore(**llm_result["strategic_value"]),
    )

    timing = TimingResult(score=timing_score, days_to_deadline=timing_days)

    return ScoredOpportunity(
        **opp.model_dump(),
        gating=gating,
        scores=scores,
        timing=timing,
        final_score=final_score,
        suggested_tags=suggested_tags,
        scored_at=datetime.now(timezone.utc),
    )


async def _score_all(inputs: list[OpportunityInput]) -> list[ScoredOpportunity]:
    return [await score_opportunity(opp) for opp in inputs]


def run_scoring_pipeline(inputs: list[OpportunityInput]) -> list[ScoredOpportunity]:
    """
    Synchronous entry point for the scoring pipeline.

    Runs the async scoring coroutines in a new event loop if called from a
    non-async context, or schedules them on the running loop when called from
    within an async Azure Function handler.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # We are inside an async context (e.g. Azure Functions async handler).
        # Use asyncio.ensure_future / run_coroutine_threadsafe if needed,
        # but the simpler approach is to just await directly — callers inside
        # async functions should call _score_all directly.  For sync callers
        # that somehow end up with a running loop, fall back to a thread.
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(asyncio.run, _score_all(inputs))
            return future.result()
    else:
        return asyncio.run(_score_all(inputs))
