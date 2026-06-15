from __future__ import annotations

from email_parsing import scoring


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


def test_funding_value_bands():
    assert scoring._funding_value_score(1500, None) == (3, 1500)
    assert scoring._funding_value_score(3000, None) == (5, 3000)
    assert scoring._funding_value_score(8000, None) == (7, 8000)
    assert scoring._funding_value_score(20000, None) == (9, 20000)
    assert scoring._funding_value_score(50000, None) == (10, 50000)


def test_funding_value_uses_max_when_present():
    score, used = scoring._funding_value_score(1000, 25000)
    assert (score, used) == (9, 25000)


def test_score_opportunity_geography_hard_fail(opportunity, monkeypatch):
    opportunity.location = "Scotland only"
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)
    result = scoring.score_opportunity(opportunity)
    assert result.gating["status"] == "failed"
    assert result.scores is None
    assert result.final_score is None


def test_score_opportunity_passes(opportunity, monkeypatch):
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)
    monkeypatch.setattr(
        scoring, "_eligibility_with_llm",
        lambda opp: {"pass": True, "confidence": 0.9, "reasoning": "Test stub — relevant"},
    )
    result = scoring.score_opportunity(opportunity)
    assert result.gating["status"] == "passed"
    assert result.gating["eligibility"]["pass"] is True
    assert result.scores is not None
    assert "funding_value" in result.scores
    assert "amount_used" in result.scores["funding_value"]
    assert "score" not in result.scores["funding_value"]
    assert result.final_score is not None
    assert 0 <= result.final_score <= 100
    assert result.scored_at is not None


def test_score_opportunity_eligibility_hard_fail(opportunity, monkeypatch):
    monkeypatch.setattr(scoring, "_geography_with_llm", scoring._geography_keyword_fallback)
    monkeypatch.setattr(
        scoring, "_eligibility_with_llm",
        lambda opp: {"pass": False, "confidence": 0.9, "reasoning": "Sector: forestry"},
    )
    result = scoring.score_opportunity(opportunity)
    assert result.gating["status"] == "failed"
    assert result.gating["eligibility"]["pass"] is False
    assert result.scores is None
    assert result.final_score is None


def test_eligibility_keyword_fallback_passes_on_m4w_text(opportunity):
    result = scoring._eligibility_keyword_fallback(opportunity)
    assert result["pass"] is True
    assert result["confidence"] > 0


def test_eligibility_keyword_fallback_fails_on_sector_mismatch():
    from email_parsing.schema import FundingOpportunity
    opp = FundingOpportunity(
        id="opp-x", funder_name="Forestry Commission",
        program_name="Tree Planting Fund", amount=10000,
        type="government", deadline="unknown", location="England",
        description="Grants to support tree planting and forestry projects.",
    )
    result = scoring._eligibility_keyword_fallback(opp)
    assert result["pass"] is False


def test_eligibility_keyword_fallback_fails_on_stem():
    from email_parsing.schema import FundingOpportunity
    opp = FundingOpportunity(
        id="opp-x", funder_name="Royal Institution",
        program_name="STEM Education Grants", amount=5000,
        type="trust", deadline="unknown", location="UK",
        description="Grants for schools to support STEM subjects.",
    )
    result = scoring._eligibility_keyword_fallback(opp)
    assert result["pass"] is False
