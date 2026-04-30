from app.models import (
    ExtractionConfidenceGate,
    EligibilityGate,
    GeographyGate,
)

# ── Extraction Confidence (algorithmic) ──────────────────────────────────────

def check_extraction_confidence(confidence: float) -> ExtractionConfidenceGate:
    return ExtractionConfidenceGate(
        **{"pass": confidence >= 0.5},
    )


# ── Eligibility (from LLM result) ───────────────────────────────────────────

def check_eligibility(llm_eligibility: dict) -> EligibilityGate:
    """Build EligibilityGate from the LLM's eligibility response."""
    return EligibilityGate(
        **{"pass": llm_eligibility["pass"]},
        confidence=llm_eligibility["confidence"],
        reasoning=llm_eligibility["reasoning"],
    )


# ── Geography (algorithmic on location field) ────────────────────────────────

KENT_AREAS = [
    "canterbury", "dover", "medway", "thanet", "swale", "gravesham",
    "dartford", "maidstone", "ashford", "folkestone", "tonbridge",
    "sevenoaks", "tunbridge wells", "shepway",
]

PASS_TERMS = ["kent", "uk", "england", "nationwide", "national"] + KENT_AREAS

FAIL_TERMS = [
    "scotland", "wales", "northern ireland", "greater manchester",
    "liverpool", "birmingham", "yorkshire", "cornwall",
]


def check_geography(location: str) -> GeographyGate:
    loc_lower = location.lower()

    # Check explicit fail first
    if any(term in loc_lower for term in FAIL_TERMS):
        return GeographyGate(
            **{"pass": False},
            location=location,
            specificity=None,
        )

    # Determine specificity
    specificity: str | None = None
    passed = False

    if any(term in loc_lower for term in KENT_AREAS) or "kent" in loc_lower:
        specificity = "kent_only"
        passed = True
    elif any(term in loc_lower for term in ["south east", "southeast", "regional"]):
        specificity = "uk_regional"
        passed = True
    elif any(term in loc_lower for term in ["nationwide", "national", "england", "uk"]):
        specificity = "uk_wide"
        passed = True

    return GeographyGate(
        **{"pass": passed},

        specificity=specificity,
    )
