import pytest

from app.gating import (
    check_eligibility,
    check_extraction_confidence,
    check_geography,
)


class TestExtractionConfidence:
    def test_high_confidence_passes(self):
        result = check_extraction_confidence(0.85)
        assert result.pass_ is True

    def test_low_confidence_fails(self):
        result = check_extraction_confidence(0.3)
        assert result.pass_ is False

    def test_boundary(self):
        assert check_extraction_confidence(0.5).pass_ is True
        assert check_extraction_confidence(0.49).pass_ is False


class TestEligibility:
    def test_pass_from_llm(self):
        result = check_eligibility(
            {"pass": True, "confidence": 0.9, "reasoning": "Strong alignment"}
        )
        assert result.pass_ is True
        assert result.confidence == 0.9

    def test_fail_from_llm(self):
        result = check_eligibility(
            {"pass": False, "confidence": 0.1, "reasoning": "No alignment"}
        )
        assert result.pass_ is False

    def test_preserves_reasoning(self):
        result = check_eligibility(
            {"pass": True, "confidence": 0.75, "reasoning": "Partial match on wellbeing"}
        )
        assert result.reasoning == "Partial match on wellbeing"


class TestGeography:
    def test_kent_passes(self):
        result = check_geography("Kent, UK")
        assert result.pass_ is True
        assert result.specificity == "kent_only"

    def test_canterbury_passes(self):
        result = check_geography("Canterbury")
        assert result.pass_ is True
        assert result.specificity == "kent_only"

    def test_nationwide_passes(self):
        result = check_geography("Nationwide")
        assert result.pass_ is True
        assert result.specificity == "uk_wide"

    def test_scotland_fails(self):
        result = check_geography("Scotland")
        assert result.pass_ is False

    def test_south_east_regional(self):
        result = check_geography("South East England")
        assert result.pass_ is True
        assert result.specificity == "uk_regional"

    def test_ambiguous_fails(self):
        result = check_geography("Specific region TBD")
        assert result.pass_ is False
        assert result.specificity is None
