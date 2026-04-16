"""
Azure Functions entry point — Python v2 programming model.

Functions defined here:
  - poll_emails      : Timer trigger, every 15 minutes
  - scan_now         : HTTP POST /api/scan  (auth: FUNCTION)
  - get_opportunities: HTTP GET  /api/opportunities (auth: ANONYMOUS)
"""

import logging
import json
from datetime import datetime, timezone

import azure.functions as func

# ---------------------------------------------------------------------------
# Graceful import of pipeline modules so the Function App can still be loaded
# in local dev / CI even when environment variables are absent.
# ---------------------------------------------------------------------------
try:
    from core import email_client, llm_parser, storage
    _IMPORTS_OK = True
except Exception as _import_err:  # pragma: no cover
    logging.warning(
        "Pipeline module import failed — running in degraded mode. "
        "Error: %s",
        _import_err,
    )
    _IMPORTS_OK = False

logger = logging.getLogger(__name__)

app = func.FunctionApp()


# ---------------------------------------------------------------------------
# Shared processing logic
# ---------------------------------------------------------------------------

def process_emails() -> dict:
    """
    Fetch unread emails and run the full parsing pipeline on each one.

    Returns a summary dict:
        {"processed": int, "opportunities": int, "failures": int}
    """
    if not _IMPORTS_OK:
        raise RuntimeError(
            "Pipeline modules failed to import — check environment variables."
        )

    processed = 0
    opportunities = 0
    failures = 0

    emails = email_client.fetch_unread_emails()
    logger.info("Fetched %d unread email(s) to evaluate.", len(emails))

    for email_data in emails:
        email_id: str = email_data.get("id") or email_data.get("emailId", "")

        try:
            # Skip emails we have already handled
            if storage.email_already_processed(email_id):
                logger.debug("Email %s already processed — skipping.", email_id)
                continue

            # Parse with LLM pipeline
            result = llm_parser.parse_email(email_data)

            # Persist to Cosmos DB
            storage.store_parsed_email(result)

            # Count extracted opportunities
            opportunity_count = len(getattr(result, "opportunities", []))
            opportunities += opportunity_count

            # Mark the message as read in the mailbox
            email_client.mark_as_read(email_id)

            processed += 1
            logger.debug(
                "Email %s processed successfully — %d opportunity/ies found.",
                email_id,
                opportunity_count,
            )

        except Exception as exc:  # noqa: BLE001
            failures += 1
            logger.error(
                "Failed to process email %s after retries: %s",
                email_id,
                exc,
                exc_info=True,
            )
            try:
                storage.store_dead_letter(
                    email_id=email_id,
                    email_data=email_data,
                    error=str(exc),
                    failed_at=datetime.now(timezone.utc).isoformat(),
                )
                email_client.move_to_folder(email_id, "ParseFailed")
            except Exception as dead_letter_exc:  # noqa: BLE001
                logger.error(
                    "Could not store dead-letter for email %s: %s",
                    email_id,
                    dead_letter_exc,
                )

    summary = {
        "processed": processed,
        "opportunities": opportunities,
        "failures": failures,
    }
    logger.info(
        "Processed %d emails, found %d opportunities, %d failures.",
        processed,
        opportunities,
        failures,
    )
    return summary


# ---------------------------------------------------------------------------
# Function 1: Timer trigger — poll every 15 minutes
# ---------------------------------------------------------------------------

@app.timer_trigger(
    arg_name="timer",
    schedule="0 */15 * * * *",
    run_on_startup=False,
    use_monitor=True,
)
def poll_emails(timer: func.TimerRequest) -> None:
    """Scheduled poll: fetch and parse unread funding emails."""
    utc_now = datetime.now(timezone.utc).isoformat()
    logger.info("poll_emails triggered at %s.", utc_now)

    if timer.past_due:
        logger.warning("Timer trigger is past due — processing now anyway.")

    try:
        summary = process_emails()
        logger.info(
            "poll_emails complete — processed: %d, opportunities: %d, failures: %d.",
            summary["processed"],
            summary["opportunities"],
            summary["failures"],
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("poll_emails raised an unhandled exception: %s", exc, exc_info=True)
        raise


# ---------------------------------------------------------------------------
# Function 2: HTTP POST /api/scan — manual trigger
# ---------------------------------------------------------------------------

@app.route(route="scan", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def scan_now(req: func.HttpRequest) -> func.HttpResponse:
    """Manually trigger the email processing pipeline."""
    logger.info("scan_now: manual trigger received.")

    try:
        summary = process_emails()
        return func.HttpResponse(
            body=json.dumps(summary),
            status_code=200,
            mimetype="application/json",
        )
    except RuntimeError as exc:
        # Degraded mode or missing config
        logger.error("scan_now: configuration error — %s", exc)
        return func.HttpResponse(
            body=json.dumps({"error": str(exc)}),
            status_code=503,
            mimetype="application/json",
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("scan_now: unexpected error — %s", exc, exc_info=True)
        return func.HttpResponse(
            body=json.dumps({"error": "Internal server error", "detail": str(exc)}),
            status_code=500,
            mimetype="application/json",
        )


# ---------------------------------------------------------------------------
# Function 3: HTTP GET /api/opportunities — frontend read endpoint
# ---------------------------------------------------------------------------

@app.route(route="opportunities", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def get_opportunities(req: func.HttpRequest) -> func.HttpResponse:
    """
    Return a JSON array of funding opportunities, with optional filtering.

    Query parameters (all optional):
        type        — FundingType  e.g. "grant"
        status      — OpportunityStatus  e.g. "identified"
        funderName  — partial / exact funder name
    """
    logger.info("get_opportunities: request received.")

    if not _IMPORTS_OK:
        return func.HttpResponse(
            body=json.dumps({"error": "Service unavailable — pipeline not initialised."}),
            status_code=503,
            mimetype="application/json",
        )

    filters: dict = {}
    for param in ("type", "status", "funderName"):
        value = req.params.get(param)
        if value:
            filters[param] = value

    try:
        results = storage.get_opportunities(filters)

        # Serialise: support both Pydantic models and plain dicts
        serialisable = []
        for item in results:
            if hasattr(item, "model_dump"):
                serialisable.append(item.model_dump(mode="json"))
            elif hasattr(item, "dict"):
                serialisable.append(item.dict())
            else:
                serialisable.append(item)

        return func.HttpResponse(
            body=json.dumps(serialisable, default=str),
            status_code=200,
            mimetype="application/json",
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("get_opportunities: error — %s", exc, exc_info=True)
        return func.HttpResponse(
            body=json.dumps({"error": "Failed to retrieve opportunities", "detail": str(exc)}),
            status_code=500,
            mimetype="application/json",
        )


# ---------------------------------------------------------------------------
# Function 4: HTTP GET /api/dead-letters — list failed emails for manual review
# ---------------------------------------------------------------------------

@app.route(route="dead-letters", methods=["GET"], auth_level=func.AuthLevel.FUNCTION)
def list_dead_letters(req: func.HttpRequest) -> func.HttpResponse:
    """
    Return all unprocessed / failed emails awaiting manual review.

    Query parameters (all optional):
        include_resolved — set to "true" to also return already-resolved entries
    """
    logger.info("list_dead_letters: request received.")

    if not _IMPORTS_OK:
        return func.HttpResponse(
            body=json.dumps({"error": "Service unavailable — pipeline not initialised."}),
            status_code=503,
            mimetype="application/json",
        )

    include_resolved = req.params.get("include_resolved", "false").lower() == "true"

    try:
        results = storage.get_dead_letters(include_resolved=include_resolved)
        return func.HttpResponse(
            body=json.dumps(results, default=str),
            status_code=200,
            mimetype="application/json",
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("list_dead_letters: error — %s", exc, exc_info=True)
        return func.HttpResponse(
            body=json.dumps({"error": "Failed to retrieve dead letters", "detail": str(exc)}),
            status_code=500,
            mimetype="application/json",
        )


# ---------------------------------------------------------------------------
# Function 5: HTTP POST /api/dead-letters/{email_id}/retry — reprocess one email
# ---------------------------------------------------------------------------

@app.route(route="dead-letters/{email_id}/retry", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def retry_dead_letter(req: func.HttpRequest) -> func.HttpResponse:
    """
    Attempt to reprocess a single failed email by its emailId.

    On success: parses and stores the opportunity, marks the dead-letter as
    resolved, and marks the email as read in the mailbox.

    On failure: increments the retry count and returns the error — the email
    stays in the dead-letters list for further review.
    """
    email_id: str = req.route_params.get("email_id", "")
    logger.info("retry_dead_letter: retrying email %s", email_id)

    if not _IMPORTS_OK:
        return func.HttpResponse(
            body=json.dumps({"error": "Service unavailable — pipeline not initialised."}),
            status_code=503,
            mimetype="application/json",
        )

    if not email_id:
        return func.HttpResponse(
            body=json.dumps({"error": "email_id is required"}),
            status_code=400,
            mimetype="application/json",
        )

    # Load the dead-letter document to get the original email data
    dead_letter = storage.get_dead_letter(email_id)
    if dead_letter is None:
        return func.HttpResponse(
            body=json.dumps({"error": f"No dead-letter found for emailId: {email_id}"}),
            status_code=404,
            mimetype="application/json",
        )

    # Use the preserved raw email data for the retry; fall back to reconstructing
    # a minimal dict from the stored subject/body if raw data wasn't captured
    email_data: dict = dead_letter.get("rawEmailData") or {
        "id": email_id,
        "subject": dead_letter.get("subject", ""),
        "body": dead_letter.get("body", ""),
        "from": "",
        "receivedDateTime": dead_letter.get("failedAt", ""),
    }
    # Ensure the id field is always set correctly
    email_data["id"] = email_id

    try:
        result = llm_parser.parse_email(email_data)
        storage.store_parsed_email(result)
        storage.resolve_dead_letter(email_id)
        email_client.mark_as_read(email_id)

        opportunities_found = len(result.opportunities)
        logger.info(
            "retry_dead_letter: email %s reprocessed successfully — %d opportunity/ies found.",
            email_id,
            opportunities_found,
        )
        return func.HttpResponse(
            body=json.dumps({
                "success": True,
                "emailId": email_id,
                "opportunities": opportunities_found,
                "classification": result.classification,
            }),
            status_code=200,
            mimetype="application/json",
        )

    except Exception as exc:  # noqa: BLE001
        error_msg = str(exc)
        logger.error(
            "retry_dead_letter: email %s failed again — %s", email_id, error_msg, exc_info=True
        )
        storage.increment_dead_letter_retry(email_id, error_msg)
        return func.HttpResponse(
            body=json.dumps({
                "success": False,
                "emailId": email_id,
                "error": error_msg,
                "message": "Retry failed — email remains in dead-letters for further review.",
            }),
            status_code=422,
            mimetype="application/json",
        )
