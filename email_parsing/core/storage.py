"""
Cosmos DB NoSQL API storage layer.

Responsibilities
----------------
- Lazy-initialise the database and containers on first use
- De-duplicate emails via emailId before processing
- Upsert fully parsed emails as Cosmos documents
- Query opportunities with optional type / status / funderName filters
- Store unprocessable emails in a separate dead-letters container
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from azure.cosmos import CosmosClient, PartitionKey, exceptions as cosmos_exc

from . import config
from .schema import ParsedEmail

logger = logging.getLogger(__name__)

# ── Internal state ────────────────────────────────────────────────────────────

_cosmos_client: CosmosClient | None = None
_container_cache: dict[str, Any] = {}

_DEAD_LETTERS_CONTAINER = "dead-letters"


# ── Client / container initialisation ────────────────────────────────────────


def _get_client() -> CosmosClient:
    global _cosmos_client
    if _cosmos_client is None:
        _cosmos_client = CosmosClient(
            url=config.COSMOS_ENDPOINT,
            credential=config.COSMOS_KEY,
        )
        logger.debug("Cosmos DB client initialised (endpoint=%s)", config.COSMOS_ENDPOINT)
    return _cosmos_client


def _ensure_container(container_name: str, partition_key_path: str = "/emailId") -> Any:
    """
    Return a ContainerProxy, creating the database and container if they do
    not yet exist (idempotent — safe to call on every cold start).
    """
    if container_name in _container_cache:
        return _container_cache[container_name]

    client = _get_client()

    database = client.create_database_if_not_exists(id=config.COSMOS_DATABASE)
    logger.debug("Using database '%s'", config.COSMOS_DATABASE)

    container = database.create_container_if_not_exists(
        id=container_name,
        partition_key=PartitionKey(path=partition_key_path),
        offer_throughput=None,  # serverless / free tier — no manual RU provisioning
    )
    logger.debug("Using container '%s' in database '%s'", container_name, config.COSMOS_DATABASE)

    _container_cache[container_name] = container
    return container


def get_container():
    """
    Return the primary opportunities container, creating it if necessary.
    Partition key: /emailId
    """
    return _ensure_container(config.COSMOS_CONTAINER, "/emailId")


# ── Public API ────────────────────────────────────────────────────────────────


def email_already_processed(email_id: str) -> bool:
    """
    Return True if a document with the given emailId already exists in Cosmos.

    Uses a point-read (cheap) rather than a cross-partition query.
    """
    container = get_container()
    try:
        container.read_item(item=email_id, partition_key=email_id)
        logger.debug("Email %s already processed — skipping", email_id)
        return True
    except cosmos_exc.CosmosResourceNotFoundError:
        return False
    except Exception as exc:  # noqa: BLE001
        logger.error("Error checking for email %s: %s", email_id, exc)
        # Treat as unprocessed to avoid silently dropping emails
        return False


def store_parsed_email(parsed_email: ParsedEmail) -> None:
    """
    Upsert a :class:`ParsedEmail` as a Cosmos document.

    The Cosmos ``id`` field is set to ``emailId`` so that re-processing the
    same email overwrites the previous result rather than creating a duplicate.
    """
    container = get_container()

    # Cosmos requires a string ``id`` field at the top level
    document = parsed_email.model_dump(mode="json")
    document["id"] = parsed_email.emailId  # Cosmos document id == emailId

    container.upsert_item(document)
    logger.info(
        "Upserted parsed email '%s' with %d opportunity/opportunities",
        parsed_email.emailId,
        len(parsed_email.opportunities),
    )


def get_opportunities(filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """
    Return a list of opportunity dicts from all stored ParsedEmail documents.

    Supported filter keys (all optional):
        type        — exact match on FundingType string
        status      — exact match on OpportunityStatus string
        funderName  — case-insensitive substring match

    Returns:
        A flat list of opportunity dicts (each has all FundingOpportunity fields
        plus ``emailId`` and ``emailSubject`` from the parent document).
    """
    container = get_container()
    filters = filters or {}

    where_clauses: list[str] = []
    params: list[dict[str, Any]] = []

    if "type" in filters:
        where_clauses.append("opp.type = @type")
        params.append({"name": "@type", "value": filters["type"]})

    if "status" in filters:
        where_clauses.append("opp.status = @status")
        params.append({"name": "@status", "value": filters["status"]})

    if "funderName" in filters:
        # CONTAINS is case-sensitive in Cosmos SQL; use LOWER for a simple
        # case-insensitive substring search
        where_clauses.append("CONTAINS(LOWER(opp.funderName), @funderName)")
        params.append({"name": "@funderName", "value": filters["funderName"].lower()})

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    query = f"""
        SELECT
            c.emailId,
            c.emailSubject,
            opp.id,
            opp.funderName,
            opp.programName,
            opp.amount,
            opp.amountMax,
            opp.type,
            opp.deadline,
            opp.location,
            opp.duration,
            opp.durationMonths,
            opp.relationship,
            opp.status,
            opp.score,
            opp.tags,
            opp.description,
            opp.eligibility,
            opp.notes,
            opp.website,
            opp.contactName,
            opp.contactEmail,
            opp.source,
            opp.extractionConfidence
        FROM c
        JOIN opp IN c.opportunities
        {where_sql}
    """

    results = list(
        container.query_items(
            query=query,
            parameters=params if params else None,
            enable_cross_partition_query=True,
        )
    )
    logger.info("get_opportunities returned %d result(s) with filters=%s", len(results), filters)
    return results


def store_dead_letter(
    email_id: str,
    error: str,
    subject: str = "",
    body: str = "",
    email_data: dict[str, Any] | None = None,
    failed_at: str = "",
) -> None:
    """
    Persist a failed / unparseable email to the dead-letters container so it
    can be reviewed and reprocessed manually.

    Accepts either individual fields (subject, body) or the raw email_data dict
    produced by :func:`email_client.fetch_unread_emails`.

    Args:
        email_id:   Graph API message ID.
        error:      Exception or error message describing the failure.
        subject:    Email subject line (used when email_data is not supplied).
        body:       Plain-text email body, may be truncated (used when email_data is not supplied).
        email_data: Raw email dict from the Graph API wrapper (takes priority over subject/body).
        failed_at:  ISO 8601 timestamp of the failure; defaults to now (UTC).
    """
    container = _ensure_container(_DEAD_LETTERS_CONTAINER, "/emailId")

    if email_data:
        subject = email_data.get("subject", subject)
        body = email_data.get("body", body)

    document = {
        "id": email_id,
        "emailId": email_id,
        "subject": subject,
        "body": body[:4000],  # cap at 4 KB to avoid large Cosmos documents
        "rawEmailData": email_data or {},  # preserve full original for retry
        "error": str(error),
        "failedAt": failed_at or datetime.now(timezone.utc).isoformat(),
        "retryCount": 0,
        "resolved": False,
    }

    container.upsert_item(document)
    logger.warning("Stored dead-letter for email %s: %s", email_id, error)


def get_dead_letters(include_resolved: bool = False) -> list[dict[str, Any]]:
    """
    Return all dead-letter documents, optionally including resolved ones.

    Args:
        include_resolved: If True, also return entries that were successfully
                          retried. Defaults to False (only unresolved).

    Returns:
        List of dead-letter dicts ordered by failedAt descending.
    """
    container = _ensure_container(_DEAD_LETTERS_CONTAINER, "/emailId")

    where = "" if include_resolved else "WHERE c.resolved = false"
    query = f"""
        SELECT
            c.emailId,
            c.subject,
            c.error,
            c.failedAt,
            c.retryCount,
            c.resolved,
            c.resolvedAt,
            c.body
        FROM c
        {where}
        ORDER BY c.failedAt DESC
    """

    results = list(
        container.query_items(query=query, enable_cross_partition_query=True)
    )
    logger.info(
        "get_dead_letters returned %d result(s) (include_resolved=%s)",
        len(results),
        include_resolved,
    )
    return results


def get_dead_letter(email_id: str) -> dict[str, Any] | None:
    """
    Retrieve a single dead-letter document by emailId.

    Returns None if no document is found.
    """
    container = _ensure_container(_DEAD_LETTERS_CONTAINER, "/emailId")
    try:
        return container.read_item(item=email_id, partition_key=email_id)
    except cosmos_exc.CosmosResourceNotFoundError:
        return None


def increment_dead_letter_retry(email_id: str, error: str) -> None:
    """
    Increment the retryCount and update the error message on a dead-letter
    document after a failed retry attempt.
    """
    container = _ensure_container(_DEAD_LETTERS_CONTAINER, "/emailId")
    doc = get_dead_letter(email_id)
    if doc is None:
        logger.warning("increment_dead_letter_retry: no document found for %s", email_id)
        return

    doc["retryCount"] = doc.get("retryCount", 0) + 1
    doc["error"] = error
    doc["lastRetryAt"] = datetime.now(timezone.utc).isoformat()
    container.upsert_item(doc)


def resolve_dead_letter(email_id: str) -> None:
    """
    Mark a dead-letter document as resolved after a successful retry.
    """
    container = _ensure_container(_DEAD_LETTERS_CONTAINER, "/emailId")
    doc = get_dead_letter(email_id)
    if doc is None:
        logger.warning("resolve_dead_letter: no document found for %s", email_id)
        return

    doc["resolved"] = True
    doc["resolvedAt"] = datetime.now(timezone.utc).isoformat()
    container.upsert_item(doc)
    logger.info("Dead-letter %s marked as resolved", email_id)
