"""CLI entry point for the email parsing + scoring pipeline.

Usage:
    python -m email_parsing.run [--count N] [--mark-read] [--output PATH] [--no-store]

Reads recent emails from a personal Outlook account, parses each via the LLM,
scores any extracted opportunities, and (by default) upserts them to Supabase.
A JSON summary is always printed to stdout; pass --output to also write the
full parsed payload to disk.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import config, llm, outlook, scoring, storage
from .schema import ParsedEmail


log = logging.getLogger("email_parsing")


def _parse_received(value: str) -> datetime:
    try:
        return datetime.fromisoformat((value or "").replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return datetime.now(timezone.utc)


def process_email(email: dict, *, do_score: bool = True) -> ParsedEmail:
    parse_result = llm.parse_email(email)

    if do_score and parse_result.opportunities:
        scoring.score_all(parse_result.opportunities)

    return ParsedEmail(
        emailId=email["id"],
        emailSubject=email.get("subject", ""),
        emailFrom=email.get("from", ""),
        emailReceivedAt=_parse_received(email.get("receivedDateTime", "")),
        parsedAt=datetime.now(timezone.utc),
        modelUsed=config.LLM_MODEL,
        classification=parse_result.classification,
        classificationConfidence=parse_result.classificationConfidence,
        opportunities=parse_result.opportunities,
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Pull, parse, score, and store funding emails.")
    ap.add_argument("--count", type=int, default=10, help="Number of recent emails to fetch.")
    ap.add_argument(
        "--unread-only",
        action="store_true",
        help="Only fetch unread Outlook emails (use with --mark-read for an "
        "inbox-driven watermark that skips already-processed messages).",
    )
    ap.add_argument("--mark-read", action="store_true", help="Mark processed emails as read in Outlook.")
    ap.add_argument("--no-store", action="store_true", help="Skip the Supabase upsert.")
    ap.add_argument("--no-score", action="store_true", help="Skip the scoring stage.")
    ap.add_argument("--output", type=Path, help="Write the full parsed payload as JSON to this path.")
    ap.add_argument("--log-level", default=os.environ.get("LOG_LEVEL", "INFO"))
    args = ap.parse_args(argv)

    logging.basicConfig(level=args.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    missing_llm = config.missing_required("LLM_API_KEY")
    if missing_llm:
        print(f"Missing required env vars: {', '.join(missing_llm)}", file=sys.stderr)
        return 2

    do_store = not args.no_store
    if do_store:
        missing_db = config.missing_required("SUPABASE_URL", "SUPABASE_KEY")
        if missing_db:
            print(
                f"Missing required env vars for storage: {', '.join(missing_db)} "
                f"(or pass --no-store)",
                file=sys.stderr,
            )
            return 2

    log.info(
        "Fetching %d recent %semail(s) from Outlook…",
        args.count,
        "unread " if args.unread_only else "",
    )
    emails = outlook.fetch_recent(args.count, unread_only=args.unread_only)
    log.info("Got %d email(s).", len(emails))

    parsed_payloads: list[dict] = []
    processed = failed = total_opps = 0

    for email in emails:
        eid = email["id"]
        subject = (email.get("subject") or "")[:80]
        log.info("---- %s | %s", (email.get("receivedDateTime") or "")[:10], subject)

        try:
            parsed = process_email(email, do_score=not args.no_score)
        except Exception as exc:
            failed += 1
            log.error("FAILED on %s: %s", eid, exc, exc_info=True)
            continue

        n = len(parsed.opportunities)
        total_opps += n
        log.info("  classification=%s opportunities=%d", parsed.classification, n)
        for i, opp in enumerate(parsed.opportunities, 1):
            score = f"{opp.final_score:.1f}" if opp.final_score is not None else "n/a"
            log.info("    [%d] %s — %s (score %s)", i, opp.funderName, opp.programName, score)

        if do_store:
            try:
                storage.store_parsed_email(parsed)
            except Exception as exc:
                failed += 1
                log.error("Storage upsert failed for %s: %s", eid, exc, exc_info=True)
                continue

        if args.mark_read:
            try:
                outlook.mark_as_read(eid)
            except Exception as exc:
                log.warning("Could not mark %s as read: %s", eid, exc)

        processed += 1
        parsed_payloads.append(parsed.model_dump(mode="json"))

    summary = {
        "processed": processed,
        "failed": failed,
        "opportunities": total_opps,
        "stored": do_store,
    }
    print(json.dumps(summary, indent=2))

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(parsed_payloads, indent=2, default=str))
        log.info("Wrote full payload to %s", args.output)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
