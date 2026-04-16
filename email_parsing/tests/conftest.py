from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys

import pytest

# Ensure tests can import the local `core` package regardless the invocation cwd.
EMAIL_PARSING_ROOT = Path(__file__).resolve().parents[1]
if str(EMAIL_PARSING_ROOT) not in sys.path:
    sys.path.insert(0, str(EMAIL_PARSING_ROOT))

from core.schema import FundingOpportunity, ParsedEmail


@pytest.fixture
def sample_email_data() -> dict[str, str]:
    return {
        "id": "msg-123",
        "subject": "Funding opportunity for youth services",
        "from": "alerts@example.org",
        "receivedDateTime": "2026-03-10T09:15:00Z",
        "body": "A funder is offering up to 25000 GBP for youth projects.",
    }


@pytest.fixture
def sample_opportunity() -> FundingOpportunity:
    return FundingOpportunity(
        id="opp-1",
        funderName="Example Trust",
        programName="Community Grants",
        amount=10000,
        amountMax=25000,
        type="trust",
        deadline="2026-07-01",
        location="UK",
        duration="single-year",
        durationMonths=12,
        relationship="new",
        status="identified",
        score=82,
        tags=["youth", "community"],
        description="Supports local community services.",
        eligibility="Registered charities in the UK",
        notes="",
        website="https://example.org/grants",
        contactName="Alex Smith",
        contactEmail="alex@example.org",
        source="email:msg-123",
        extractionConfidence=0.9,
    )


@pytest.fixture
def sample_parsed_email(sample_opportunity: FundingOpportunity) -> ParsedEmail:
    return ParsedEmail(
        emailId="msg-123",
        emailSubject="Funding opportunity for youth services",
        emailFrom="alerts@example.org",
        emailReceivedAt=datetime(2026, 3, 10, 9, 15, tzinfo=timezone.utc),
        parsedAt=datetime(2026, 3, 10, 9, 16, tzinfo=timezone.utc),
        modelUsed="gpt-4o-mini",
        classification="FUNDING_OPPORTUNITY",
        classificationConfidence=0.91,
        opportunities=[sample_opportunity],
    )