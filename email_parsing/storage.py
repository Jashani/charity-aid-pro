"""Airtable persistence for parsed + scored opportunities.

Each opportunity becomes one record in the Airtable "Opportunities" table.
Only opportunities that pass the checks are written. Records are keyed on the `Source ID` field (`{emailId}#{idx}`). A rerun on the
same email skips records that already exist, so edits the team makes in
Airtable (status, notes, ...) are never overwritten by the pipeline.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import date
from functools import lru_cache
from typing import Any, Iterator

import httpx

from . import config
from .schema import FundingOpportunity, ParsedEmail


logger = logging.getLogger(__name__)

_API_URL = "https://api.airtable.com/v0"
# Airtable accepts at most 10 records per create request.
_BATCH_SIZE = 10
# Airtable asks clients to wait 30 s after a 429 before retrying.
_RATE_LIMIT_WAIT_SECONDS = 30
_MAX_RETRIES = 3

# Pipeline funding type → Airtable "Funding Type" option.
FUNDING_TYPE_LABELS = {
    "trust_foundation": "Trust & Foundation",
    "corporate": "Corporate",
    "local_authority": "Local Authority",
    "central_government": "Central Government",
    "lottery": "Lottery",
    "individual": "Individual",
}

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@lru_cache(maxsize=1)
def _client() -> httpx.Client:
    if not config.AIRTABLE_TOKEN:
        raise RuntimeError("AIRTABLE_TOKEN is not set")
    return httpx.Client(
        base_url=f"{_API_URL}/{config.AIRTABLE_BASE_ID}",
        headers={"Authorization": f"Bearer {config.AIRTABLE_TOKEN}"},
        timeout=30,
    )


def _request(method: str, path: str, **kwargs: Any) -> dict[str, Any]:
    for attempt in range(_MAX_RETRIES + 1):
        resp = _client().request(method, path, **kwargs)
        if resp.status_code == 429 and attempt < _MAX_RETRIES:
            logger.warning("Airtable rate limit hit — waiting %ds", _RATE_LIMIT_WAIT_SECONDS)
            time.sleep(_RATE_LIMIT_WAIT_SECONDS)
            continue
        if resp.is_error:
            raise RuntimeError(f"Airtable {method} {path} failed ({resp.status_code}): {resp.text}")
        return resp.json()
    raise AssertionError("unreachable")


def _list_records(table: str, params: dict[str, Any]) -> Iterator[dict[str, Any]]:
    params = dict(params)
    while True:
        data = _request("GET", f"/{table}", params=params)
        yield from data.get("records", [])
        if not data.get("offset"):
            return
        params["offset"] = data["offset"]


def _formula_string(value: str) -> str:
    """Quote *value* as a string literal for an Airtable formula."""
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


# ── Record mapping ───────────────────────────────────────────────────────────

def _iso_date(value: str | None) -> str | None:
    try:
        return date.fromisoformat((value or "")[:10]).isoformat()
    except ValueError:
        return None


def _valid_email(value: str | None) -> str | None:
    value = (value or "").strip()
    return value if _EMAIL_RE.match(value) else None


def opp_to_fields(opp: FundingOpportunity, parsed: ParsedEmail, source_id: str) -> dict[str, Any]:
    """Build the Airtable field values for one opportunity.

    Empty values are left out: Airtable rejects some of them (e.g. "" in an
    email field) and a missing key leaves the cell blank anyway.
    """
    notes = opp.notes
    deadline = _iso_date(opp.deadline)
    if not deadline and opp.deadline and opp.deadline != "unknown":
        # Keep a deadline the date field can't hold (e.g. "end of March").
        notes = f"{notes}\nDeadline as written: {opp.deadline}".strip()

    title = opp.funder_name
    programme = opp.program_name.strip()
    if programme.lower() in ("unknown", "n/a"):
        programme = ""
    if programme:
        title = f"{programme} – {opp.funder_name}"

    score_check = (opp.gating or {}).get("score") or {}

    # Only opportunities that pass the checks get here (dismissed ones are not
    # written), so the pipeline does not write Status "Opportunity Dismissed",
    # "Dismissal Reason" or "Gating".
    fields: dict[str, Any] = {
        "Opportunity": title,
        "Status": "New",
        "Score": opp.final_score if opp.final_score is not None else opp.score,
        "Funder": opp.funder_name,
        "Programme": programme,
        "Deadline": deadline,
        "Amount Min": opp.amount_min,
        "Amount Max": opp.amount_max,
        "Amount Typical": opp.amount_typical,
        "Funding Type": FUNDING_TYPE_LABELS.get(opp.type),
        "Location": opp.location,
        "Duration (Months)": opp.duration_months,
        "Description": opp.description,
        "Website": opp.website,
        "Contact Name": opp.contact_name,
        "Contact Email": _valid_email(opp.contact_email),
        "Notes": notes,
        "Activity Score": score_check.get("activity_score"),
        "Audience Score": score_check.get("audience_score"),
        "Score Reasoning": score_check.get("reasoning", ""),
        "Scored At": opp.scored_at.isoformat() if opp.scored_at else None,
        "Date Found": parsed.parsed_at.isoformat(),
        "Email Subject": parsed.email_subject,
        "Email From": _valid_email(parsed.email_from),
        "Email Received": parsed.email_received_at.isoformat(),
        "Source ID": source_id,
    }

    return {k: v for k, v in fields.items() if v not in (None, "", [])}


# ── Write ────────────────────────────────────────────────────────────────────

def _existing_source_ids(email_id: str) -> set[str]:
    prefix = _formula_string(f"{email_id}#")
    params = {
        "filterByFormula": f"LEFT({{Source ID}}, LEN({prefix})) = {prefix}",
        "fields[]": "Source ID",
    }
    return {
        rec["fields"]["Source ID"]
        for rec in _list_records(config.AIRTABLE_OPPORTUNITIES_TABLE, params)
        if rec.get("fields", {}).get("Source ID")
    }


def email_already_stored(email_id: str) -> bool:
    """True if the table has a record from *email_id* (it was processed before)."""
    return bool(_existing_source_ids(email_id))


def store_parsed_email(parsed: ParsedEmail) -> int:
    """Create Airtable records for *parsed*. Returns the number of records created."""
    if not parsed.opportunities:
        return 0

    existing = _existing_source_ids(parsed.email_id)
    records: list[dict[str, Any]] = []
    for idx, opp in enumerate(parsed.opportunities):
        # Deterministic id keeps reruns idempotent even when the LLM reuses ids.
        source_id = f"{parsed.email_id}#{idx}"
        if source_id in existing:
            logger.info("Skipping %s — already in Airtable", source_id)
            continue
        records.append({"fields": opp_to_fields(opp, parsed, source_id)})

    for start in range(0, len(records), _BATCH_SIZE):
        _request(
            "POST",
            f"/{config.AIRTABLE_OPPORTUNITIES_TABLE}",
            # typecast lets Airtable add a missing select option instead of rejecting the record.
            json={"records": records[start:start + _BATCH_SIZE], "typecast": True},
        )

    logger.info("Created %d Airtable record(s) for email %s", len(records), parsed.email_id)
    return len(records)
