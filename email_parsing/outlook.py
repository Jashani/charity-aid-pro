"""Personal Outlook mailbox access via MSAL device-code flow.

One-time interactive auth: run `python -m email_parsing.outlook auth` to populate
the token cache. The cache file refreshes silently afterwards. For CI, base64-
encode the cache file and pass via the MSAL_TOKEN_CACHE_B64 env var.
"""

from __future__ import annotations

import argparse
import base64
import logging
import os
import re
import sys
from io import BytesIO
from pathlib import Path
from typing import Any

import httpx
import msal
from markitdown import MarkItDown

from . import config


logger = logging.getLogger(__name__)

_AUTHORITY = "https://login.microsoftonline.com/consumers"
# Mail.ReadWrite — needed to flip isRead=true on processed messages, which is
# how the cron pipeline knows what's already been handled. Mail.Read alone
# would cause mark_as_read to 403 and break the watermark.
_SCOPES = ["Mail.ReadWrite"]
_GRAPH_INBOX = "https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages"

_markitdown = MarkItDown()


# ── Token cache ──────────────────────────────────────────────────────────────

def _load_cache() -> msal.SerializableTokenCache:
    cache = msal.SerializableTokenCache()

    if config.MSAL_TOKEN_CACHE_B64:
        try:
            cache.deserialize(base64.b64decode(config.MSAL_TOKEN_CACHE_B64).decode("utf-8"))
            logger.info("Loaded MSAL cache from MSAL_TOKEN_CACHE_B64")
            return cache
        except Exception as exc:
            logger.warning("Could not decode MSAL_TOKEN_CACHE_B64: %s", exc)

    path = Path(config.MSAL_CACHE_FILE)
    if path.exists():
        cache.deserialize(path.read_text())
    return cache


def _save_cache(cache: msal.SerializableTokenCache) -> None:
    if not cache.has_state_changed:
        return
    path = Path(config.MSAL_CACHE_FILE)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(cache.serialize())


def _app(cache: msal.SerializableTokenCache) -> msal.PublicClientApplication:
    return msal.PublicClientApplication(
        config.MSAL_CLIENT_ID, authority=_AUTHORITY, token_cache=cache
    )


def get_access_token() -> str:
    """Return a valid access token, refreshing silently if possible."""
    cache = _load_cache()
    app = _app(cache)
    accounts = app.get_accounts()
    if not accounts:
        raise RuntimeError(
            f"No cached MSAL account. Run `python -m email_parsing.outlook auth` "
            f"once to authenticate (cache: {config.MSAL_CACHE_FILE})."
        )
    result = app.acquire_token_silent(_SCOPES, account=accounts[0])
    if not result or "access_token" not in result:
        raise RuntimeError("Cached MSAL token expired — re-run `outlook auth` to refresh.")
    _save_cache(cache)
    return result["access_token"]


def authenticate_interactive() -> None:
    """Run the device-code flow and persist the token cache."""
    cache = _load_cache()
    app = _app(cache)
    flow = app.initiate_device_flow(scopes=_SCOPES)
    if "user_code" not in flow:
        raise RuntimeError(f"Could not start device flow: {flow!r}")
    print(flow["message"])
    sys.stdout.flush()
    result = app.acquire_token_by_device_flow(flow)
    if "access_token" not in result:
        raise RuntimeError(f"Auth failed: {result.get('error_description', result)}")
    _save_cache(cache)
    print(f"Token cached at {config.MSAL_CACHE_FILE}")


# ── Email fetch ──────────────────────────────────────────────────────────────

def _html_to_markdown(html: str) -> str:
    try:
        return _markitdown.convert_stream(BytesIO(html.encode("utf-8")), file_extension=".html").text_content
    except Exception as exc:
        logger.warning("markitdown failed (%s) — falling back to tag strip", exc)
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()


def fetch_recent(count: int = 10, *, unread_only: bool = False) -> list[dict[str, Any]]:
    """Fetch the most recent inbox messages, body converted to plain text.

    When *unread_only* is True the Graph query is filtered to `isRead eq false`,
    which — combined with `--mark-read` — gives the cron pipeline a reliable
    "only new emails" behavior without any external watermark.
    """
    token = get_access_token()
    params: dict[str, Any] = {
        "$top": count,
        "$orderby": "receivedDateTime desc",
        "$select": "id,subject,from,receivedDateTime,body",
    }
    if unread_only:
        params["$filter"] = "isRead eq false"
    with httpx.Client(timeout=30) as client:
        resp = client.get(
            _GRAPH_INBOX,
            params=params,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
    resp.raise_for_status()

    out: list[dict[str, Any]] = []
    for msg in resp.json().get("value", []):
        body = msg.get("body") or {}
        content = body.get("content", "") or ""
        ctype = (body.get("contentType") or "text").lower()
        body_text = _html_to_markdown(content) if ctype == "html" else content.strip()
        out.append({
            "id": msg["id"],
            "subject": msg.get("subject", "(no subject)"),
            "from": (msg.get("from") or {}).get("emailAddress", {}).get("address", ""),
            "receivedDateTime": msg.get("receivedDateTime", ""),
            "body": body_text,
        })
    return out


def mark_as_read(message_id: str) -> None:
    token = get_access_token()
    with httpx.Client(timeout=30) as client:
        resp = client.patch(
            f"https://graph.microsoft.com/v1.0/me/messages/{message_id}",
            json={"isRead": True},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
    resp.raise_for_status()


# ── CLI ──────────────────────────────────────────────────────────────────────

def _cli() -> int:
    ap = argparse.ArgumentParser(description="Outlook mailbox helpers")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("auth", help="Run device-code flow to populate the token cache")
    sub.add_parser("export-cache", help="Print base64-encoded cache for CI secret use")

    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.cmd == "auth":
        authenticate_interactive()
    elif args.cmd == "export-cache":
        path = Path(config.MSAL_CACHE_FILE)
        if not path.exists():
            print(f"No cache at {path} — run `auth` first", file=sys.stderr)
            return 1
        print(base64.b64encode(path.read_bytes()).decode("ascii"))
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
