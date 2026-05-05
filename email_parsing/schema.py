"""Pydantic models for the email parsing + scoring pipeline."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


FundingType = Literal["grant", "trust", "lottery", "corporate", "government"]
OpportunityStatus = Literal[
    "identified", "researching", "applying", "submitted", "awarded", "rejected"
]
DurationType = Literal["single-year", "multi-year"]
ClassificationLabel = Literal["FUNDING_OPPORTUNITY", "NEWSLETTER", "IRRELEVANT"]


class FundingOpportunity(BaseModel):
    id: str
    funderName: str
    programName: str
    amount: float
    amountMax: float | None = None
    type: FundingType
    deadline: str
    location: str
    duration: DurationType
    durationMonths: int = 12
    status: OpportunityStatus = "identified"
    score: float = Field(default=0.0, ge=0.0, le=100.0)
    tags: list[str] = Field(default_factory=list)
    description: str = ""
    eligibility: str = ""
    notes: str = ""
    website: str = ""
    contactName: str | None = None
    contactEmail: str | None = None
    source: str = ""
    extractionConfidence: float = Field(default=0.0, ge=0.0, le=1.0)

    # Scoring output (populated after scoring.score_opportunity runs)
    gating: Any | None = None
    scores: Any | None = None
    timing: Any | None = None
    final_score: float | None = None
    suggested_tags: list[str] = Field(default_factory=list)
    scored_at: datetime | None = None


class ParseResult(BaseModel):
    """Output of `llm.parse_email` for a single email."""

    classification: ClassificationLabel
    classificationConfidence: float = Field(ge=0.0, le=1.0)
    opportunities: list[FundingOpportunity] = Field(default_factory=list)


class ParsedEmail(BaseModel):
    """One fully-parsed email with scored opportunities, written to storage."""

    emailId: str
    emailSubject: str
    emailFrom: str
    emailReceivedAt: datetime
    parsedAt: datetime
    modelUsed: str
    classification: ClassificationLabel
    classificationConfidence: float = Field(ge=0.0, le=1.0)
    opportunities: list[FundingOpportunity] = Field(default_factory=list)
