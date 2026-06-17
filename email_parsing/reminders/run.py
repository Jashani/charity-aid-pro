"""Reminder pipeline. Runs daily on GitHub Actions.

Flow per rule:
  1. Load active opportunities relevant to this cadence type.
  2. Find all (opp, offset) pairs that match today.
  3. For each recipient, claim log rows for each matched opp (dedup).
  4. Send ONE batched email per recipient containing all matched opps.
  5. Roll back claimed rows if the send fails.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, datetime, timezone
from functools import lru_cache
from typing import Any

from postgrest.exceptions import APIError
from supabase import Client, create_client

from .. import config
from . import mailer
from .template import (
    render_deadline,
    render_results_chase,
    render_stale_opportunity,
    render_funding_expiry,
)

logger = logging.getLogger(__name__)

# Statuses that receive deadline / stale reminders.
DEADLINE_STATUSES = ("identified", "on_hold", "researching", "applying", "submitted", "part_submitted")
ACTIVE_STATUSES   = ("identified", "on_hold", "researching", "applying", "submitted", "part_submitted")

# (opp dict, offset_days used for dedup, metric value passed to template)
Match = tuple[dict[str, Any], int, int]


@lru_cache(maxsize=1)
def _client() -> Client:
    if not config.SUPABASE_URL or not config.SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY are not set")
    return create_client(config.SUPABASE_URL, config.SUPABASE_KEY)


def _parse_date(value: str | None) -> date | None:
    try:
        return date.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None


def _parse_updated_at(value: str | None) -> date | None:
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).date()
    except (ValueError, TypeError, AttributeError):
        return None


def _days_until(target: date, today: date) -> int:
    return (target - today).days


def _load_rules(rule_id: str | None) -> list[dict[str, Any]]:
    q = _client().table("reminder_rules").select("*").eq("enabled", True)
    if rule_id:
        q = q.eq("id", rule_id)
    return q.execute().data or []


def _load_recipients() -> list[dict[str, Any]]:
    return (
        _client().table("reminder_recipients")
        .select("*").eq("enabled", True).execute().data or []
    )


def _load_opps(statuses: tuple[str, ...], extra_filter: dict | None = None) -> list[dict[str, Any]]:
    q = _client().table("opportunities").select("*").in_("status", list(statuses))
    return q.execute().data or []


def _try_claim_log(opportunity_id: str, rule_id: str, recipient: str, offset_days: int) -> bool:
    try:
        _client().table("reminder_log").insert({
            "opportunity_id": opportunity_id,
            "rule_id": rule_id,
            "recipient": recipient,
            "offset_days": offset_days,
        }).execute()
        return True
    except APIError as exc:
        if getattr(exc, "code", None) == "23505" or "23505" in str(exc):
            return False
        raise


def _delete_log(opportunity_id: str, rule_id: str, recipient: str, offset_days: int) -> None:
    (_client().table("reminder_log")
        .delete()
        .eq("opportunity_id", opportunity_id)
        .eq("rule_id", rule_id)
        .eq("recipient", recipient)
        .eq("offset_days", offset_days)
        .execute())


def _touch_rule_last_sent(rule_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    (_client().table("reminder_rules")
        .update({"last_sent": now, "updated_at": now})
        .eq("id", rule_id)
        .execute())


# ---------------------------------------------------------------------------
# Match functions — return list of (opp, offset_days, metric)
# ---------------------------------------------------------------------------

def _match_deadline(rule: dict, today: date) -> list[Match]:
    offsets = rule.get("offsets_days") or []
    opps = _load_opps(DEADLINE_STATUSES)
    matches: list[Match] = []
    for opp in opps:
        dl = _parse_date(opp.get("deadline"))
        if dl is None or dl < today:
            continue
        days_left = _days_until(dl, today)
        for offset in offsets:
            if days_left == offset:
                matches.append((opp, offset, days_left))
    return matches


def _match_results_date(rule: dict, today: date) -> list[Match]:
    offsets = rule.get("offsets_days") or []
    opps = _load_opps(("submitted", "part_submitted"))
    matches: list[Match] = []
    for opp in opps:
        rd = _parse_date(opp.get("expected_results_date"))
        if rd is None:
            continue
        days_rel = _days_until(rd, today)  # negative = overdue
        for offset in offsets:
            if days_rel == offset:
                matches.append((opp, offset, days_rel))
    return matches


def _match_stale(rule: dict, today: date) -> list[Match]:
    offsets = rule.get("offsets_days") or []
    opps = _load_opps(ACTIVE_STATUSES)
    matches: list[Match] = []
    for opp in opps:
        updated = _parse_updated_at(opp.get("updated_at"))
        if updated is None:
            continue
        days_stale = (today - updated).days
        for offset in offsets:
            if days_stale == offset:
                matches.append((opp, offset, days_stale))
    return matches


def _match_expiry(rule: dict, today: date) -> list[Match]:
    offsets = rule.get("offsets_days") or []
    opps = _load_opps(("awarded", "funds_received"))
    matches: list[Match] = []
    for opp in opps:
        exp = _parse_date(opp.get("expiration_date"))
        if exp is None or exp < today:
            continue
        days_left = _days_until(exp, today)
        for offset in offsets:
            if days_left == offset:
                matches.append((opp, offset, days_left))
    return matches


# ---------------------------------------------------------------------------
# Render dispatcher
# ---------------------------------------------------------------------------

def _render(cadence: str, matches: list[Match]) -> tuple[str, str]:
    items = [(opp, metric) for opp, _offset, metric in matches]
    if cadence == "before_deadline":
        return render_deadline(items)
    if cadence == "results_date":
        return render_results_chase(items)
    if cadence == "stale_opportunity":
        return render_stale_opportunity(items)
    if cadence == "before_expiry":
        return render_funding_expiry(items)
    raise ValueError(f"Unknown cadence: {cadence!r}")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run(*, dry_run: bool, rule_id: str | None) -> dict[str, int]:
    today = datetime.now(timezone.utc).date()
    rules = _load_rules(rule_id)
    recipients = _load_recipients()

    logger.info("Loaded %d rule(s), %d recipient(s)", len(rules), len(recipients))

    if not rules or not recipients:
        logger.info("Nothing to do.")
        return {"sent": 0, "skipped": 0, "failed": 0}

    sent = skipped = failed = 0
    fired_rules: set[str] = set()

    for rule in rules:
        cadence = rule.get("cadence")
        if cadence == "before_deadline":
            matches = _match_deadline(rule, today)
        elif cadence == "results_date":
            matches = _match_results_date(rule, today)
        elif cadence == "stale_opportunity":
            matches = _match_stale(rule, today)
        elif cadence == "before_expiry":
            matches = _match_expiry(rule, today)
        else:
            logger.warning("Skipping rule %s — unsupported cadence %r", rule["id"], cadence)
            continue

        if not matches:
            logger.info("Rule %s: no matches today", rule["id"])
            continue

        logger.info("Rule %s: %d match(es) today", rule["id"], len(matches))

        for recipient in recipients:
            email = recipient["email"]

            if dry_run:
                subject, _ = _render(cadence, matches)
                logger.info("[dry-run] %s → %s | %s (%d opp(s))", rule["id"], email, subject, len(matches))
                sent += len(matches)
                continue

            # Claim log rows for each opp individually (dedup).
            claimed: list[Match] = []
            for match in matches:
                opp, offset, metric = match
                if _try_claim_log(opp["id"], rule["id"], email, offset):
                    claimed.append(match)
                else:
                    skipped += 1

            if not claimed:
                continue

            # Send one batched email for all claimed opps.
            subject, html = _render(cadence, claimed)
            ok = mailer.send(email, subject, html)
            if ok:
                sent += len(claimed)
                fired_rules.add(rule["id"])
            else:
                for opp, offset, _ in claimed:
                    _delete_log(opp["id"], rule["id"], email, offset)
                failed += len(claimed)

    if not dry_run:
        for rid in fired_rules:
            _touch_rule_last_sent(rid)

    logger.info("Done. sent=%d skipped=%d failed=%d", sent, skipped, failed)
    return {"sent": sent, "skipped": skipped, "failed": failed}


def _test_send(to: str, dry_run: bool) -> int:
    """Send a single fake reminder to *to*. Bypasses Supabase entirely."""
    fake_opp = {
        "funder_name": "Test Funder",
        "program_name": "Example Grant Programme",
        "deadline": datetime.now(timezone.utc).date().isoformat(),
        "amount": 5000,
        "amount_max": 25000,
        "status": "applying",
    }
    subject, html = render_deadline([(fake_opp, 7)])
    ok = mailer.send(to, f"[TEST] {subject}", html, dry_run=dry_run)
    return 0 if ok else 1


def _cli() -> int:
    ap = argparse.ArgumentParser(description="Run the reminder pipeline")
    ap.add_argument("--dry-run", action="store_true",
                    help="Log intended sends without contacting Graph or writing log rows")
    ap.add_argument("--rule-id", default=None,
                    help="Limit to a single rule (e.g. 'deadline')")
    ap.add_argument("--test", metavar="EMAIL", default=None,
                    help="Send one fake reminder to EMAIL and exit")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.test:
        return _test_send(args.test, dry_run=args.dry_run)

    missing = config.missing_required("SUPABASE_URL", "SUPABASE_KEY")
    if missing:
        print(f"Missing required env: {missing}", file=sys.stderr)
        return 2
    run(dry_run=args.dry_run, rule_id=args.rule_id)
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
