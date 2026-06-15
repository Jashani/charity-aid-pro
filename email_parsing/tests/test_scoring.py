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


def _stub_pass(activity: int, audience: int):
    final = round(activity * 0.4 + audience * 0.6)
    return lambda opp: {"pass": True, "activity_score": activity,
                        "audience_score": audience, "final_score": final,
                        "reasoning": "stub"}


def _stub_fail(activity: int, audience: int):
    final = round(activity * 0.4 + audience * 0.6)
    return lambda opp: {"pass": False, "activity_score": activity,
                        "audience_score": audience, "final_score": final,
                        "reasoning": "stub fail"}


def test_score_opportunity_geography_hard_fail(opportunity, monkeypatch):
    opportunity.location = "Scotland only"
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)
    result = scoring.score_opportunity(opportunity)
    assert result.gating["status"] == "failed"
    assert result.scores is None
    assert result.score == 0.0


def test_score_opportunity_passes(opportunity, monkeypatch):
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)
    monkeypatch.setattr(scoring, "_score_with_llm", _stub_pass(70, 80))
    result = scoring.score_opportunity(opportunity)
    assert result.gating["status"] == "passed"
    assert result.gating["score"]["pass"] is True
    assert result.gating["score"]["activity_score"] == 70
    assert result.gating["score"]["audience_score"] == 80
    assert result.scores == {
        "activity_alignment": {"score": 70},
        "audience_alignment": {"score": 80},
    }
    # reasoning must NOT be duplicated in scores
    assert "reasoning" not in result.scores
    expected_final = round(70 * 0.4 + 80 * 0.6)
    assert result.final_score == float(expected_final)
    assert result.scored_at is not None


def test_score_opportunity_dismissed_on_fail(opportunity, monkeypatch):
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)
    monkeypatch.setattr(scoring, "_score_with_llm", _stub_fail(5, 5))
    result = scoring.score_opportunity(opportunity)
    assert result.gating["status"] == "failed"
    assert result.gating["score"]["pass"] is False
    assert result.scores is None
    assert result.score == 0.0
    assert result.status == "dismissed"
    assert result.dismissal_reason == "stub fail"


def test_weighted_score_40_60(opportunity, monkeypatch):
    """Final score must be activity×0.4 + audience×0.6."""
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)
    monkeypatch.setattr(scoring, "_score_with_llm", _stub_pass(60, 90))
    result = scoring.score_opportunity(opportunity)
    assert result.final_score == float(round(60 * 0.4 + 90 * 0.6))  # 78


def test_score_below_20_forces_dismissal(opportunity, monkeypatch):
    """LLM returning a weighted score < 20 must dismiss even if pass=true."""
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)

    def stubbed(opp):
        # Simulate inconsistent LLM: pass=true but scores are very low
        activity, audience = 10, 10
        final = round(activity * 0.4 + audience * 0.6)
        passed = True
        if final < 20:
            passed = False
        return {"pass": passed, "activity_score": activity, "audience_score": audience,
                "final_score": final, "reasoning": "Low alignment"}

    monkeypatch.setattr(scoring, "_score_with_llm", stubbed)
    result = scoring.score_opportunity(opportunity)
    assert result.gating["status"] == "failed"
    assert result.status == "dismissed"


def test_score_keyword_fallback_passes_on_m4w_text(opportunity):
    result = scoring._score_keyword_fallback(opportunity)
    assert result["pass"] is True
    assert result["activity_score"] > 0 or result["audience_score"] > 0


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


def test_strong_match_tag_at_80(opportunity, monkeypatch):
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)
    monkeypatch.setattr(scoring, "_score_with_llm", _stub_pass(80, 80))
    result = scoring.score_opportunity(opportunity)
    assert "Strong Match" in result.tags


def test_no_strong_match_tag_below_80(opportunity, monkeypatch):
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)
    monkeypatch.setattr(scoring, "_score_with_llm", _stub_pass(60, 70))
    result = scoring.score_opportunity(opportunity)
    assert "Strong Match" not in result.tags
