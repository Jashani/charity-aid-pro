"""
Pydantic v2 models that mirror the TypeScript FundingOpportunity interface
and the supporting types produced by the email-parsing pipeline.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ── Literal enum types (match TypeScript exactly) ─────────────────────────────

FundingType = Literal["grant", "trust", "lottery", "corporate", "government"]

OpportunityStatus = Literal[
    "identified",
    "researching",
    "applying",
    "submitted",
    "awarded",
    "rejected",
]

RelationshipStatus = Literal["new", "previously-applied", "existing-funder", "re-eligible"]

DurationType = Literal["single-year", "multi-year"]

ClassificationLabel = Literal["FUNDING_OPPORTUNITY", "NEWSLETTER", "IRRELEVANT"]


# ── Core domain models ─────────────────────────────────────────────────────────


class FundingOpportunity(BaseModel):
    """
    A single funding opportunity extracted from an email.
    Mirrors the TypeScript FundingOpportunity interface with additional
    pipeline metadata fields.
    """

    id: str = Field(description="Unique identifier for this opportunity")
    funderName: str = Field(description="Name of the funding organisation")
    programName: str = Field(description="Name of the specific grant programme")
    amount: float = Field(description="Minimum (or exact) grant amount in GBP")
    amountMax: float | None = Field(default=None, description="Maximum grant amount if a range is stated")
    type: FundingType = Field(description="Category of funder")
    deadline: str = Field(description="Application deadline (ISO 8601 date string or human-readable)")
    location: str = Field(description="Geographic scope / eligibility area")
    duration: DurationType = Field(description="Whether the grant is single-year or multi-year")
    durationMonths: int = Field(description="Funding duration in months")
    relationship: RelationshipStatus = Field(
        default="new",
        description="Charity's relationship with this funder",
    )
    status: OpportunityStatus = Field(
        default="identified",
        description="Current pipeline status for this opportunity",
    )
    score: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        description="Relevance / fit score out of 100",
    )
    tags: list[str] = Field(default_factory=list, description="Categorisation tags")
    description: str = Field(description="Brief description of the funding programme")
    eligibility: str = Field(description="Key eligibility criteria")
    notes: str = Field(default="", description="Additional notes")
    website: str = Field(description="URL for the funding programme")
    contactName: str | None = Field(default=None, description="Primary contact name")
    contactEmail: str | None = Field(default=None, description="Primary contact email")
    source: str = Field(description="Origin of this record, e.g. 'email:<emailId>'")

    # Pipeline metadata
    extractionConfidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="LLM confidence in the extracted data (0–1)",
    )


class ClassificationResult(BaseModel):
    """Result of the email classification step."""

    classification: ClassificationLabel = Field(
        description="High-level label for the email"
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Model confidence in the classification (0–1)",
    )
    reason: str = Field(description="Brief explanation for the classification decision")


class ParsedEmail(BaseModel):
    """
    Top-level document stored in Cosmos DB, representing one fully-parsed email
    and all opportunities identified within it.
    """

    emailId: str = Field(description="Graph API message ID (used as Cosmos document id)")
    emailSubject: str = Field(description="Email subject line")
    emailFrom: str = Field(description="Sender address")
    emailReceivedAt: datetime = Field(description="When the email was received (UTC)")
    parsedAt: datetime = Field(description="When the pipeline processed this email (UTC)")
    modelUsed: str = Field(description="Final OpenAI deployment name used for extraction")
    classification: ClassificationLabel = Field(description="Top-level classification label")
    classificationConfidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence score for the classification",
    )
    opportunities: list[FundingOpportunity] = Field(
        default_factory=list,
        description="Opportunities extracted from this email",
    )
