from datetime import datetime, timezone

from app.algorithmic import score_funding_value
from app.gating import (
    check_eligibility,
    check_extraction_confidence,
    check_geography,
)
from app.llm import score_opportunity_with_llm
from app.models import (
    FundingValueScore,
    GatingResult,
    OpportunityInput,
    ReasonedScore,
    ScoredOpportunity,
    ScoresResult,
    StrategicFitScore,
)


async def score_opportunity(opp: OpportunityInput) -> ScoredOpportunity:
    """Run the full scoring pipeline on a single opportunity."""

    # ── Stage 1a: Algorithmic gates (cheap, run before LLM) ─────────────
    extraction = check_extraction_confidence(opp.extractionConfidence)
    geography = check_geography(opp.location)

    # Geography hard fail → skip LLM call entirely
    geography_hard_fail = not geography.pass_ and geography.specificity is None
    if geography_hard_fail:
        # Still need an eligibility gate for the output — mark as not assessed
        eligibility = check_eligibility(
            {"pass": False, "confidence": 0.0, "reasoning": "Not assessed — geography hard fail"}
        )
        gating = GatingResult(
            status="failed",
            extraction_confidence=extraction,
            eligibility=eligibility,
            geography=geography,
        )
        return ScoredOpportunity(
            **opp.model_dump(),
            gating=gating,
            scored_at=datetime.now(timezone.utc),
        )

    # ── Stage 1b + 3: Single LLM call (eligibility + scores) ────────────
    llm_result = await score_opportunity_with_llm(opp.model_dump())

    # ── Stage 1c: Resolve gating with LLM eligibility ───────────────────
    eligibility = check_eligibility(llm_result["eligibility"])

    gates = [extraction, eligibility, geography]
    any_failed = any(not g.pass_ for g in gates)

    if not any_failed:
        gating_status = "passed"
    else:
        gating_status = "needs_review"

    gating = GatingResult(
        status=gating_status,
        extraction_confidence=extraction,
        eligibility=eligibility,
        geography=geography,
    )

    # ── Stage 2: Algorithmic scores ──────────────────────────────────────
    fv_score, fv_amount = score_funding_value(opp.amount, opp.amountMax)

    # ── Stage 3: Score extraction ────────────────────────────────────────
    strategic_fit_raw = llm_result["strategic_fit"]["score"]
    strategic_fit_final = min(strategic_fit_raw, 10)  # Cap at 10

    effort_score = llm_result["effort"]["score"]
    probability_score = llm_result["probability"]["score"]
    strategic_value_score = llm_result["strategic_value"]["score"]

    # ── Tag generation ───────────────────────────────────────────────────
    suggested_tags: list[str] = []
    if effort_score >= 8:
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
            final=round(strategic_fit_final, 2),
            reasoning=llm_result["strategic_fit"]["reasoning"],
        ),
        funding_value=FundingValueScore(amount_used=fv_amount),
        probability=ReasonedScore(**llm_result["probability"]),
        effort=ReasonedScore(**llm_result["effort"]),
        strategic_value=ReasonedScore(**llm_result["strategic_value"]),
    )

    # Compute final score from component scores
    final_score = round(
        (
            strategic_fit_final * 0.30
            + effort_score * 0.05  # effort has minimal weight
            + probability_score * 0.15
            + strategic_value_score * 0.15
            + (fv_amount / 50000) * 10 * 0.35  # normalize amount to 0-10 scale
        ),
        1,
    )

    return ScoredOpportunity(
        **opp.model_dump(),
        gating=gating,
        scores=scores,
        timing={"score": None, "days_to_deadline": None},  # Placeholder
        final_score=final_score,
        suggested_tags=suggested_tags,
        scored_at=datetime.now(timezone.utc),
    )
