from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

# Make the repo root importable so `email_parsing` is a package.
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from email_parsing.schema import FundingOpportunity, ParsedEmail


@pytest.fixture
def opportunity() -> FundingOpportunity:
    return FundingOpportunity(
        id="opp-1",
        funderName="Example Trust",
        programName="Community Wellbeing Fund",
        amount=10000,
        amountMax=25000,
        type="trust",
        deadline="2026-07-01",
        location="Kent",
        duration="single-year",
        durationMonths=12,
        status="identified",
        description="Supports older people and wellbeing services in Kent.",
        eligibility="Registered charities operating in Kent",
        website="https://example.org/grants",
        source="email:msg-123",
        extractionConfidence=0.9,
    )


@pytest.fixture
def parsed_email(opportunity) -> ParsedEmail:
    return ParsedEmail(
        emailId="msg-123",
        emailSubject="Funding for older people in Kent",
        emailFrom="alerts@example.org",
        emailReceivedAt=datetime(2026, 3, 10, 9, 15, tzinfo=timezone.utc),
        parsedAt=datetime(2026, 3, 10, 9, 16, tzinfo=timezone.utc),
        modelUsed="gemini-2.5-flash",
        classification="FUNDING_OPPORTUNITY",
        classificationConfidence=0.91,
        opportunities=[opportunity],
    )
