from __future__ import annotations

from email_parsing import scoring
from email_parsing.schema import FundingOpportunity


def test_geography_keyword_fallback_kent():
    result = scoring._geography_keyword_fallback("Kent")
    assert result["pass"] is True


def test_geography_keyword_fallback_uk_passes():
    assert scoring._geography_keyword_fallback("UK-wide")["pass"] is True
    assert scoring._geography_keyword_fallback("England")["pass"] is True
    assert scoring._geography_keyword_fallback("South East")["pass"] is True


def test_geography_keyword_fallback_scotland_fails():
    assert scoring._geography_keyword_fallback("Scotland only")["pass"] is False


def test_geography_keyword_fallback_unknown_passes():
    assert scoring._geography_keyword_fallback("")["pass"] is True


def test_score_opportunity_geography_hard_fail(opportunity, monkeypatch):
    opportunity.location = "Scotland only"
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)
    result = scoring.score_opportunity(opportunity)
    assert result.gating["status"] == "failed"
    assert result.scores is None
    assert result.score == 0.0


def test_score_opportunity_passes(opportunity, monkeypatch):
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)
    monkeypatch.setattr(
        scoring, "_score_with_llm",
        lambda opp: {"pass": True, "score": 75, "reasoning": "Good mission alignment"},
    )
    result = scoring.score_opportunity(opportunity)
    assert result.gating["status"] == "passed"
    assert result.gating["score"]["pass"] is True
    assert result.scores is not None
    assert "mission_alignment" in result.scores
    assert result.scores["mission_alignment"]["score"] == 75
    assert result.final_score == 75.0
    assert result.scored_at is not None


def test_score_opportunity_dismissed_on_fail(opportunity, monkeypatch):
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)
    monkeypatch.setattr(
        scoring, "_score_with_llm",
        lambda opp: {"pass": False, "score": 5, "reasoning": "Sector: forestry"},
    )
    result = scoring.score_opportunity(opportunity)
    assert result.gating["status"] == "failed"
    assert result.gating["score"]["pass"] is False
    assert result.scores is None
    assert result.score == 0.0
    assert result.status == "dismissed"
    assert result.dismissal_reason == "Sector: forestry"


def test_score_keyword_fallback_passes_on_m4w_text(opportunity):
    result = scoring._score_keyword_fallback(opportunity)
    assert result["pass"] is True
    assert result["score"] > 0


def test_score_keyword_fallback_fails_on_sector_mismatch():
    opp = FundingOpportunity(
        id="opp-x", funder_name="Forestry Commission",
        program_name="Tree Planting Fund", amount=10000,
        type="government", deadline="unknown", location="England",
        description="Grants to support tree planting and forestry projects.",
    )
    result = scoring._score_keyword_fallback(opp)
    assert result["pass"] is False


def test_score_keyword_fallback_fails_on_stem():
    opp = FundingOpportunity(
        id="opp-x", funder_name="Royal Institution",
        program_name="STEM Education Grants", amount=5000,
        type="trust", deadline="unknown", location="UK",
        description="Grants for schools to support STEM subjects.",
    )
    result = scoring._score_keyword_fallback(opp)
    assert result["pass"] is False


def test_score_below_20_forces_pass_false(opportunity, monkeypatch):
    """LLM returning score < 20 must be dismissed even if it returns pass=true."""
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)
    # Simulate LLM being inconsistent: pass=true but score=15
    original = scoring._score_with_llm

    def stubbed_llm(opp):
        result = {"pass": True, "score": 15, "reasoning": "Low alignment"}
        score = max(0, min(100, int(result["score"])))
        passed = bool(result["pass"])
        if score < 20:
            passed = False
        return {"pass": passed, "score": score, "reasoning": result["reasoning"]}

    monkeypatch.setattr(scoring, "_score_with_llm", stubbed_llm)
    result = scoring.score_opportunity(opportunity)
    assert result.gating["status"] == "failed"
    assert result.status == "dismissed"
