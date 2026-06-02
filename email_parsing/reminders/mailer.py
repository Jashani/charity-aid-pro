"""Microsoft Graph sendMail wrapper.

Reuses the MSAL token acquired by email_parsing.outlook. Requires the cached
token to include the Mail.Send scope (see email_parsing/outlook.py::_SCOPES).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..outlook import get_access_token


logger = logging.getLogger(__name__)

_SEND_URL = "https://graph.microsoft.com/v1.0/me/sendMail"


def send(to: str, subject: str, html: str, *, dry_run: bool = False) -> bool:
    """Send an HTML email via Graph. Returns True on success.

    With *dry_run*, logs the intended send and returns True without contacting
    Graph or consuming a token.
    """
    if dry_run:
        logger.info("[dry-run] would send to %s | subject=%r", to, subject)
        return True

    token = get_access_token()
    payload: dict[str, Any] = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": html},
            "toRecipients": [{"emailAddress": {"address": to}}],
        },
        "saveToSentItems": True,
    }
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            _SEND_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
    if resp.status_code == 202:
        logger.info("Sent reminder to %s", to)
        return True
    logger.error("Graph sendMail failed (%d): %s", resp.status_code, resp.text)
    return False
