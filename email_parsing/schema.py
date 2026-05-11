"""Pydantic models for the email parsing + scoring pipeline."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


FundingType = Literal["grant", "trust", "lottery", "corporate", "government"]
OpportunityStatus = Literal[
    "identified", "researching", "applying", "submitted", "awarded", "rejected", "dismissed"
]
ClassificationLabel = Literal["FUNDING_OPPORTUNITY", "NEWSLETTER", "IRRELEVANT"]


class FundingOpportunity(BaseModel):
    id: str
    funder_name: str
    program_name: str
    amount: float
    amount_max: float | None = None
    type: FundingType
    deadline: str
    location: str
    duration_months: int = 12
    status: OpportunityStatus = "identified"
    score: float = Field(default=0.0, ge=0.0, le=100.0)
    tags: list[str] = Field(default_factory=list)
    description: str = ""
    notes: str = ""
    website: str = ""
    contact_name: str | None = None
    contact_email: str | None = None
    expiration_date: str | None = None
    amount_awarded: float | None = None
    dismissal_reason: str | None = None
    reapplication_date: str | None = None

    # Scoring output (populated after scoring.score_opportunity runs)
    gating: Any | None = None
    scores: Any | None = None
    final_score: float | None = None
    scored_at: datetime | None = None


class ParseResult(BaseModel):
    """Output of `llm.parse_email` for a single email."""

    classification: ClassificationLabel
    classification_confidence: float = Field(ge=0.0, le=1.0)
    opportunities: list[FundingOpportunity] = Field(default_factory=list)


class ParsedEmail(BaseModel):
    """One fully-parsed email with scored opportunities, written to storage."""

    email_id: str
    email_subject: str
    email_from: str
    email_received_at: datetime
    parsed_at: datetime
    model_used: str
    classification: ClassificationLabel
    classification_confidence: float = Field(ge=0.0, le=1.0)
    opportunities: list[FundingOpportunity] = Field(default_factory=list)
