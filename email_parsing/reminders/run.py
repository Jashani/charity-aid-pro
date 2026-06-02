"""Reminder pipeline. Runs daily on GitHub Actions.

Flow:
  1. Load enabled rules + recipients + open opportunities from Supabase
  2. For each (rule, opp, offset, recipient) where days_until_deadline == offset:
       a. Try to insert into reminder_log (unique-constraint = dedup)
       b. If inserted, send the email via Graph
  3. Update each fired rule's last_sent.
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
from .template import render_deadline


logger = logging.getLogger(__name__)

# Opportunities in these statuses receive deadline reminders.
ACTIVE_STATUSES = (
    "identified", "on_hold", "researching", "applying", "submitted",
)


@lru_cache(maxsize=1)
def _client() -> Client:
    if not config.SUPABASE_URL or not config.SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY are not set")
    return create_client(config.SUPABASE_URL, config.SUPABASE_KEY)


def _parse_deadline(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def _days_until(deadline: date, today: date) -> int:
    return (deadline - today).days


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


def _load_opportunities() -> list[dict[str, Any]]:
    return (
        _client().table("opportunities")
        .select("*").in_("status", list(ACTIVE_STATUSES)).execute().data or []
    )


def _try_claim_log(
    opportunity_id: str, rule_id: str, recipient: str, offset_days: int
) -> bool:
    """Insert a reminder_log row. Returns True if inserted, False if duplicate."""
    try:
        _client().table("reminder_log").insert({
            "opportunity_id": opportunity_id,
            "rule_id": rule_id,
            "recipient": recipient,
            "offset_days": offset_days,
        }).execute()
        return True
    except APIError as exc:
        # 23505 = unique_violation. Already sent — skip silently.
        if getattr(exc, "code", None) == "23505" or "23505" in str(exc):
            return False
        raise


def _delete_log(
    opportunity_id: str, rule_id: str, recipient: str, offset_days: int
) -> None:
    """Roll back a log row if the email send failed."""
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


def run(*, dry_run: bool, rule_id: str | None) -> dict[str, int]:
    today = datetime.now(timezone.utc).date()
    rules = _load_rules(rule_id)
    recipients = _load_recipients()
    opportunities = _load_opportunities()

    logger.info(
        "Loaded %d rule(s), %d recipient(s), %d active opportunity(ies)",
        len(rules), len(recipients), len(opportunities),
    )

    if not rules or not recipients:
        logger.info("Nothing to do.")
        return {"sent": 0, "skipped": 0, "failed": 0}

    sent = skipped = failed = 0
    fired_rules: set[str] = set()

    for rule in rules:
        if rule.get("cadence") != "before_deadline":
            logger.warning("Skipping rule %s — unsupported cadence %r", rule["id"], rule.get("cadence"))
            continue
        offsets: list[int] = rule.get("offsets_days") or []

        for opp in opportunities:
            deadline = _parse_deadline(opp.get("deadline", ""))
            if deadline is None or deadline < today:
                continue
            days_left = _days_until(deadline, today)

            for offset in offsets:
                if days_left != offset:
                    continue
                subject, html = render_deadline(opp, days_left)
                for recipient in recipients:
                    email = recipient["email"]
                    if dry_run:
                        logger.info("[dry-run] %s → %s | %s", rule["id"], email, subject)
                        sent += 1
                        continue
                    claimed = _try_claim_log(opp["id"], rule["id"], email, offset)
                    if not claimed:
                        skipped += 1
                        continue
                    ok = mailer.send(email, subject, html)
                    if ok:
                        sent += 1
                        fired_rules.add(rule["id"])
                    else:
                        # Roll back the log claim so tomorrow's run retries.
                        _delete_log(opp["id"], rule["id"], email, offset)
                        failed += 1

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
        "deadline": (datetime.now(timezone.utc).date()).isoformat(),
        "amount": 5000,
        "amount_max": 25000,
        "status": "applying",
    }
    subject, html = render_deadline(fake_opp, days_left=7)
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
