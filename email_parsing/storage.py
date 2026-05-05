"""Supabase persistence for parsed + scored opportunities."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from . import config
from .schema import FundingOpportunity, ParsedEmail


logger = logging.getLogger(__name__)


_FIELD_MAP: dict[str, str] = {
    "id": "id",
    "funderName": "funder_name",
    "programName": "program_name",
    "amount": "amount",
    "amountMax": "amount_max",
    "type": "type",
    "deadline": "deadline",
    "location": "location",
    "duration": "duration",
    "durationMonths": "duration_months",
    "status": "status",
    "score": "score",
    "tags": "tags",
    "description": "description",
    "eligibility": "eligibility",
    "notes": "notes",
    "website": "website",
    "contactName": "contact_name",
    "contactEmail": "contact_email",
    "source": "source",
    "extractionConfidence": "extraction_confidence",
    "gating": "gating",
    "scores": "scores",
    "timing": "timing",
    "final_score": "final_score",
    "suggested_tags": "suggested_tags",
    "scored_at": "scored_at",
}


@lru_cache(maxsize=1)
def _client() -> Client:
    if not config.SUPABASE_URL or not config.SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY are not set")
    return create_client(config.SUPABASE_URL, config.SUPABASE_KEY)


def _opp_to_row(opp: FundingOpportunity) -> dict[str, Any]:
    src = opp.model_dump(mode="json")
    return {db: src[py] for py, db in _FIELD_MAP.items() if py in src}


def store_parsed_email(parsed: ParsedEmail) -> int:
    """Upsert opportunities for *parsed*. Returns the number of rows written."""
    rows: list[dict[str, Any]] = []
    for idx, opp in enumerate(parsed.opportunities):
        row = _opp_to_row(opp)
        # Deterministic id keeps reruns idempotent even when the LLM reuses ids.
        row["id"] = f"{parsed.emailId}#{idx}"
        rows.append(row)

    if not rows:
        return 0

    _client().table("opportunities").upsert(rows, on_conflict="id").execute()
    logger.info("Upserted %d opportunity row(s) for email %s", len(rows), parsed.emailId)
    return len(rows)
