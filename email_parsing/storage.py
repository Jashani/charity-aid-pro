"""Supabase persistence for parsed + scored opportunities."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from . import config
from .schema import FundingOpportunity, ParsedEmail


logger = logging.getLogger(__name__)


# Column names matching the DB schema. Pydantic models are already snake_case,
# so dumping covers everything we need.
_OPP_COLUMNS = {
    "id", "funder_name", "program_name", "amount", "amount_max", "type",
    "deadline", "location", "duration_months", "status", "score", "tags",
    "description", "notes", "website", "contact_name",
    "contact_email", "expiration_date", "amount_awarded", "dismissal_reason",
    "reapplication_date", "gating", "scores", "final_score", "scored_at",
}


@lru_cache(maxsize=1)
def _client() -> Client:
    if not config.SUPABASE_URL or not config.SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY are not set")
    return create_client(config.SUPABASE_URL, config.SUPABASE_KEY)


def _opp_to_row(opp: FundingOpportunity) -> dict[str, Any]:
    src = opp.model_dump(mode="json")
    return {k: v for k, v in src.items() if k in _OPP_COLUMNS}


def store_parsed_email(parsed: ParsedEmail) -> int:
    """Upsert opportunities for *parsed*. Returns the number of rows written."""
    rows: list[dict[str, Any]] = []
    for idx, opp in enumerate(parsed.opportunities):
        row = _opp_to_row(opp)
        # Deterministic id keeps reruns idempotent even when the LLM reuses ids.
        row["id"] = f"{parsed.email_id}#{idx}"
        rows.append(row)

    if not rows:
        return 0

    _client().table("opportunities").upsert(rows, on_conflict="id").execute()
    logger.info("Upserted %d opportunity row(s) for email %s", len(rows), parsed.email_id)
    return len(rows)
