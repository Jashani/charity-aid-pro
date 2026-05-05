from __future__ import annotations

from email_parsing import scoring


def test_geography_keyword_fallback_kent():
    result = scoring._geography_keyword_fallback("Kent")
    assert result["pass"] is True
    assert result["specificity"] == "kent_only"


def test_geography_keyword_fallback_scotland_fails():
    result = scoring._geography_keyword_fallback("Scotland only")
    assert result["pass"] is False


def test_geography_keyword_fallback_unknown():
    result = scoring._geography_keyword_fallback("")
    assert result["pass"] is True
    assert result["specificity"] == "unknown"


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
    result = scoring.score_opportunity(opportunity)
    assert result.gating["status"] in ("passed", "needs_review")
    assert result.scores is not None
    assert result.final_score is not None
    assert 0 <= result.final_score <= 100
    assert result.scored_at is not None
