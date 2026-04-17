"""
Microsoft Graph API wrapper for mailbox polling.

Handles:
- OAuth2 client-credentials token acquisition
- Fetching unread messages (with HTML-to-text conversion)
- Marking messages as read
- Moving messages to a named mail folder
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from markitdown import MarkItDown

from . import config

_markitdown = MarkItDown()

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
TOKEN_URL_TMPL = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"

_RETRY_ATTEMPTS = 3
_RETRY_BASE_DELAY = 1.0  # seconds; doubles on each retry


# ── Internal helpers ──────────────────────────────────────────────────────────


def _retry_request(func, *args, **kwargs) -> httpx.Response:
    """
    Call *func* (a callable that returns an httpx.Response) with simple
    exponential-backoff retry on 429 / 5xx responses or network errors.
    """
    delay = _RETRY_BASE_DELAY
    last_exc: Exception | None = None

    for attempt in range(1, _RETRY_ATTEMPTS + 1):
        try:
            response: httpx.Response = func(*args, **kwargs)
            if response.status_code in {429, 500, 502, 503, 504} and attempt < _RETRY_ATTEMPTS:
                retry_after = float(response.headers.get("Retry-After", delay))
                logger.warning(
                    "HTTP %s on attempt %d/%d — retrying in %.1fs",
                    response.status_code,
                    attempt,
                    _RETRY_ATTEMPTS,
                    retry_after,
                )
                time.sleep(retry_after)
                delay *= 2
                continue
            return response
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            last_exc = exc
            if attempt < _RETRY_ATTEMPTS:
                logger.warning(
                    "Network error on attempt %d/%d: %s — retrying in %.1fs",
                    attempt,
                    _RETRY_ATTEMPTS,
                    exc,
                    delay,
                )
                time.sleep(delay)
                delay *= 2
            else:
                raise

    # Should not be reachable, but satisfies type checkers
    raise last_exc or RuntimeError("Retry loop exhausted without result")


def _html_to_markdown(html: str) -> str:
    """Convert HTML email body to Markdown, preserving structure for LLM parsing."""
    try:
        result = _markitdown.convert_stream(
            __import__("io").BytesIO(html.encode("utf-8")),
            file_extension=".html",
        )
        return result.text_content
    except Exception as exc:  # noqa: BLE001
        # Fall back to basic tag stripping if MarkItDown fails
        logger.warning("MarkItDown conversion failed, falling back to tag strip: %s", exc)
        import re
        text = re.sub(r"<[^>]+>", " ", html)
        return re.sub(r"\s+", " ", text).strip()


# ── Public API ────────────────────────────────────────────────────────────────


def get_access_token() -> str:
    """
    Obtain a bearer token via the OAuth2 client-credentials flow.

    Returns:
        The access token string.

    Raises:
        httpx.HTTPStatusError: If the token endpoint returns a non-2xx status.
    """
    url = TOKEN_URL_TMPL.format(tenant_id=config.GRAPH_TENANT_ID)
    payload = {
        "grant_type": "client_credentials",
        "client_id": config.GRAPH_CLIENT_ID,
        "client_secret": config.GRAPH_CLIENT_SECRET,
        "scope": GRAPH_SCOPE,
    }

    with httpx.Client(timeout=30) as client:
        response = _retry_request(client.post, url, data=payload)

    response.raise_for_status()
    token: str = response.json()["access_token"]
    logger.debug("Successfully obtained Graph access token")
    return token


def fetch_unread_emails(max_count: int = 25) -> list[dict[str, Any]]:
    """
    Retrieve up to *max_count* recent messages from the configured mailbox.

    Fetches all recent messages regardless of read status so that emails
    manually read by a human are not missed. Deduplication against already-
    processed emails is handled downstream by storage.email_already_processed().

    Returns a list of dicts with keys:
        id, subject, from, receivedDateTime, body (plain text)
    """
    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    url = (
        f"{GRAPH_BASE}/users/{config.GRAPH_USER_EMAIL}/messages"
        f"?$select=id,subject,from,receivedDateTime,body"
        f"&$top={max_count}"
        f"&$orderby=receivedDateTime desc"
    )

    with httpx.Client(timeout=30) as client:
        response = _retry_request(client.get, url, headers=headers)

    response.raise_for_status()
    raw_messages: list[dict] = response.json().get("value", [])
    logger.info("Fetched %d unread message(s) from mailbox", len(raw_messages))

    results: list[dict[str, Any]] = []
    for msg in raw_messages:
        body_content: str = msg.get("body", {}).get("content", "")
        content_type: str = msg.get("body", {}).get("contentType", "text")

        if content_type.lower() == "html":
            body_text = _html_to_markdown(body_content)
        else:
            body_text = body_content.strip()

        results.append(
            {
                "id": msg["id"],
                "subject": msg.get("subject", "(no subject)"),
                "from": msg.get("from", {}).get("emailAddress", {}).get("address", ""),
                "receivedDateTime": msg.get("receivedDateTime", ""),
                "body": body_text,
            }
        )

    return results


def mark_as_read(message_id: str) -> None:
    """
    Mark a message as read via a PATCH request.

    Args:
        message_id: The Graph API message ID.
    """
    token = get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    url = f"{GRAPH_BASE}/users/{config.GRAPH_USER_EMAIL}/messages/{message_id}"

    with httpx.Client(timeout=30) as client:
        response = _retry_request(
            client.patch, url, headers=headers, json={"isRead": True}
        )

    response.raise_for_status()
    logger.debug("Marked message %s as read", message_id)


def move_to_folder(message_id: str, folder_name: str = "ParseFailed") -> None:
    """
    Move a message to a well-known or named mail folder.

    The folder is looked up by display name under the mailbox root.
    If no matching folder is found, the message is left in place and a
    warning is logged (rather than raising, to avoid blocking the pipeline).

    Args:
        message_id: The Graph API message ID to move.
        folder_name: Display name of the destination folder.
    """
    token = get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    # 1. Resolve the folder ID by display name
    folders_url = (
        f"{GRAPH_BASE}/users/{config.GRAPH_USER_EMAIL}/mailFolders"
        f"?$filter=displayName eq '{folder_name}'"
        f"&$select=id,displayName"
    )

    with httpx.Client(timeout=30) as client:
        folders_resp = _retry_request(client.get, folders_url, headers=headers)
        folders_resp.raise_for_status()
        folders: list[dict] = folders_resp.json().get("value", [])

        if not folders:
            # Attempt to create the folder
            logger.info("Folder '%s' not found — creating it", folder_name)
            create_url = f"{GRAPH_BASE}/users/{config.GRAPH_USER_EMAIL}/mailFolders"
            create_resp = _retry_request(
                client.post,
                create_url,
                headers=headers,
                json={"displayName": folder_name},
            )
            if not create_resp.is_success:
                logger.warning(
                    "Could not create folder '%s' (HTTP %s) — skipping move for message %s",
                    folder_name,
                    create_resp.status_code,
                    message_id,
                )
                return
            folder_id: str = create_resp.json()["id"]
        else:
            folder_id = folders[0]["id"]

        # 2. Move the message
        move_url = (
            f"{GRAPH_BASE}/users/{config.GRAPH_USER_EMAIL}/messages/{message_id}/move"
        )
        move_resp = _retry_request(
            client.post, move_url, headers=headers, json={"destinationId": folder_id}
        )
        move_resp.raise_for_status()

    logger.info("Moved message %s to folder '%s'", message_id, folder_name)
