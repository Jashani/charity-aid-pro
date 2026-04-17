from scoring.models import (
    ExtractionConfidenceGate,
    EligibilityGate,
    GeographyGate,
    ReapplicationGate,
)

# ── Extraction Confidence (algorithmic) ──────────────────────────────────────

def check_extraction_confidence(confidence: float) -> ExtractionConfidenceGate:
    return ExtractionConfidenceGate(
        **{"pass": confidence >= 0.5},
        value=confidence,
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
    loc_lower = location.lower().strip()

    # Explicit out-of-area → hard fail
    if any(term in loc_lower for term in FAIL_TERMS):
        return GeographyGate(
            **{"pass": False},
            location=location,
            specificity=None,
        )

    # Unknown / not specified → pass with neutral specificity (no modifier boost,
    # but not rejected — location may simply not have been mentioned in the email)
    if not loc_lower or loc_lower in ("unknown", "n/a", "not specified", "unspecified"):
        return GeographyGate(
            **{"pass": True},
            location=location,
            specificity="unknown",
        )

    # Known good geographies — ranked for scoring modifier
    if any(term in loc_lower for term in KENT_AREAS) or "kent" in loc_lower:
        specificity = "kent_only"
    elif any(term in loc_lower for term in ["south east", "southeast", "regional"]):
        specificity = "uk_regional"
    elif any(term in loc_lower for term in ["nationwide", "national", "england", "uk"]):
        specificity = "uk_wide"
    else:
        # Location mentioned but not a recognised term — pass but treat as unknown
        specificity = "unknown"

    return GeographyGate(
        **{"pass": True},
        location=location,
        specificity=specificity,
    )


# ── Reapplication (algorithmic on relationship field) ────────────────────────

def check_reapplication(relationship: str) -> ReapplicationGate:
    if relationship in ("new", "re-eligible", "existing-funder"):
        passed = True
    else:
        passed = False  # "previously-applied" → needs_review
    return ReapplicationGate(
        **{"pass": passed},
        relationship=relationship,
    )
