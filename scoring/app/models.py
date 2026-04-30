from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── Input ────────────────────────────────────────────────────────────────────

class GrantType(str, Enum):
    grant = "grant"
    trust = "trust"
    lottery = "lottery"
    corporate = "corporate"
    government = "government"


class Duration(str, Enum):
    single_year = "single-year"
    multi_year = "multi-year"


class Status(str, Enum):
    identified = "identified"
    researching = "researching"
    applying = "applying"
    submitted = "submitted"
    awarded = "awarded"
    rejected = "rejected"


class OpportunityInput(BaseModel):
    id: str
    funderName: str
    programName: str
    amount: float
    amountMax: float | None = None
    type: GrantType
    deadline: str  # ISO date string or "unknown"
    location: str
    duration: Duration
    durationMonths: int = 12
    status: Status
    score: float = 0
    tags: list[str] = Field(default_factory=list)
    description: str = ""
    eligibility: str = ""
    notes: str = ""
    website: str = ""
    contactName: str | None = None
    contactEmail: str | None = None
    source: str = ""
    extractionConfidence: float = 0.0


# ── Scoring sub-schemas ─────────────────────────────────────────────────────

class GatingCheck(BaseModel):
    pass_: bool = Field(alias="pass")

    model_config = {"populate_by_name": True}


class ExtractionConfidenceGate(GatingCheck):
    pass


class EligibilityGate(GatingCheck):
    confidence: float
    reasoning: str


class GeographyGate(GatingCheck):
    specificity: str | None = None


class GatingResult(BaseModel):
    status: str  # "passed" | "failed" | "needs_review"
    extraction_confidence: ExtractionConfidenceGate
    eligibility: EligibilityGate
    geography: GeographyGate


class StrategicFitScore(BaseModel):
    raw: float
    final: float
    reasoning: str


class FundingValueScore(BaseModel):
    amount_used: float


class ReasonedScore(BaseModel):
    score: float
    reasoning: str


class ScoresResult(BaseModel):
    strategic_fit: StrategicFitScore
    funding_value: FundingValueScore
    probability: ReasonedScore
    effort: ReasonedScore
    strategic_value: ReasonedScore


# ── Output (input opportunity + scoring appended) ───────────────────────────

class ScoredOpportunity(OpportunityInput):
    gating: GatingResult
    scores: ScoresResult | None = None
    timing: dict | None = None  # Computed: {score, days_to_deadline}
    final_score: float | None = None  # Computed: weighted composite
    suggested_tags: list[str] = Field(default_factory=list)
    scored_at: datetime
