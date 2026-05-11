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
        funder_name="Example Trust",
        program_name="Community Wellbeing Fund",
        amount=10000,
        amount_max=25000,
        type="trust",
        deadline="2026-07-01",
        location="Kent",
        duration_months=12,
        status="identified",
        description="Supports older people and wellbeing services in Kent.",
        website="https://example.org/grants",
    )


@pytest.fixture
def parsed_email(opportunity) -> ParsedEmail:
    return ParsedEmail(
        email_id="msg-123",
        email_subject="Funding for older people in Kent",
        email_from="alerts@example.org",
        email_received_at=datetime(2026, 3, 10, 9, 15, tzinfo=timezone.utc),
        parsed_at=datetime(2026, 3, 10, 9, 16, tzinfo=timezone.utc),
        model_used="gemini-2.5-flash",
        classification="FUNDING_OPPORTUNITY",
        classification_confidence=0.91,
        opportunities=[opportunity],
    )
