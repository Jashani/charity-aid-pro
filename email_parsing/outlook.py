"""Microsoft 365 (work) mailbox access via Microsoft Graph.

Two modes, chosen by config:

* App-only (recommended; used when MSAL_CLIENT_SECRET is set): the app signs in
  as itself with the client-credentials flow and reads MAILBOX_USER. No user
  login, no token cache, no expiry of a refresh token. Needs the *application*
  permission Mail.ReadWrite with admin consent.
* Delegated (used when MSAL_CLIENT_SECRET is empty): device-code login as the
  mailbox user. Run `python -m email_parsing.outlook auth` once to populate the
  token cache. For CI, base64-encode the cache file and pass it via the
  MSAL_TOKEN_CACHE_B64 env var.
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
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
import msal
from markitdown import MarkItDown

from . import config


logger = logging.getLogger(__name__)

_GRAPH = "https://graph.microsoft.com/v1.0"
# Mail.ReadWrite — needed to flip isRead=true on processed messages, which is
# how the cron pipeline knows what's already been handled. Mail.Read alone
# would cause mark_as_read to 403 and break the watermark.
_DELEGATED_SCOPES = ["Mail.ReadWrite"]
_APP_SCOPES = ["https://graph.microsoft.com/.default"]


def _authority() -> str:
    return f"https://login.microsoftonline.com/{config.MSAL_TENANT_ID}"


def _app_only() -> bool:
    return bool(config.MSAL_CLIENT_SECRET)


def _mailbox_base() -> str:
    """Graph URL prefix for the mailbox: /me (delegated) or /users/<mailbox> (app-only)."""
    if _app_only():
        return f"{_GRAPH}/users/{config.MAILBOX_USER}"
    return f"{_GRAPH}/me"

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


def _require_client_id() -> None:
    if not config.MSAL_CLIENT_ID:
        raise RuntimeError(
            "MSAL_CLIENT_ID is not set. Register an Entra app in the "
            f"{config.MSAL_TENANT_ID} tenant and set its application (client) ID."
        )


def _app(cache: msal.SerializableTokenCache) -> msal.PublicClientApplication:
    _require_client_id()
    return msal.PublicClientApplication(
        config.MSAL_CLIENT_ID, authority=_authority(), token_cache=cache
    )


def get_access_token() -> str:
    """Return a valid access token (app-only, or delegated with silent refresh)."""
    if _app_only():
        _require_client_id()
        app = msal.ConfidentialClientApplication(
            config.MSAL_CLIENT_ID,
            client_credential=config.MSAL_CLIENT_SECRET,
            authority=_authority(),
        )
        result = app.acquire_token_for_client(scopes=_APP_SCOPES)
        if "access_token" not in result:
            raise RuntimeError(f"App-only auth failed: {result.get('error_description', result)}")
        return result["access_token"]

    cache = _load_cache()
    app = _app(cache)
    accounts = app.get_accounts()
    if not accounts:
        raise RuntimeError(
            f"No cached MSAL account. Run `python -m email_parsing.outlook auth` "
            f"once to authenticate (cache: {config.MSAL_CACHE_FILE})."
        )
    # The cache may hold more than one account (e.g. an old personal one).
    wanted = config.MAILBOX_USER.lower()
    account = next(
        (a for a in accounts if (a.get("username") or "").lower() == wanted), None
    )
    if account is None:
        names = ", ".join(a.get("username", "?") for a in accounts)
        raise RuntimeError(
            f"The MSAL cache has no account for {config.MAILBOX_USER} (found: {names}). "
            f"Re-run `python -m email_parsing.outlook auth` and sign in as {config.MAILBOX_USER}."
        )
    result = app.acquire_token_silent(_DELEGATED_SCOPES, account=account)
    if not result or "access_token" not in result:
        detail = (result or {}).get("error_description") or "no token returned (cache missing, wrong app, or login expired)"
        raise RuntimeError(f"Silent MSAL login failed — re-run `outlook auth`. Reason: {detail}")
    _save_cache(cache)
    return result["access_token"]


def authenticate_interactive() -> None:
    """Run the device-code flow and persist the token cache."""
    if _app_only():
        print("MSAL_CLIENT_SECRET is set: app-only mode needs no interactive login.")
        return
    cache = _load_cache()
    app = _app(cache)
    flow = app.initiate_device_flow(scopes=_DELEGATED_SCOPES)
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

# Characters with no visible meaning. Newsletters use them as invisible "preheader"
# padding. Non-breaking spaces become normal spaces.
_INVISIBLE = re.compile("[\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u00ad\u034f\ufeff]")
# Query parameters that only track clicks. They never change which page opens.
_TRACKING_PARAMS = {
    "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "mkt_tok",
    "_hsenc", "_hsmi", "hsctatracking", "igshid", "yclid", "vero_id", "oly_enc_id",
}
_URL = re.compile(r"https?://[^\s)\]>\"']+")
# A URL (kept as it is) or a run of 4 or more of the same divider character,
# for example "......" or "______" used as a line between sections.
_DIVIDER_RUN = re.compile(r"(https?://[^\s)\]>\"']+)|([.\-_=~*\u2022\u00b7])\2{3,}")


def _strip_tracking(url: str) -> str:
    """Remove click-tracking parameters (utm_*, fbclid, ...) from a URL."""
    parts = urlsplit(url)
    if not parts.query:
        return url
    pairs = parse_qsl(parts.query, keep_blank_values=True)
    kept = [
        (k, v) for k, v in pairs
        if not (k.lower().startswith("utm_") or k.lower() in _TRACKING_PARAMS)
    ]
    if len(kept) == len(pairs):
        return url  # nothing to remove: keep the URL byte-for-byte
    return urlunsplit(parts._replace(query=urlencode(kept)))


def _clean_markdown(text: str) -> str:
    """Remove noise from converted email text without removing information.

    Removed: empty table cells and separator rows, invisible characters,
    images (the alt text stays), links with no text, click-tracking URL
    parameters, runs of divider characters ("......"), repeated spaces,
    repeated identical lines, horizontal rules.
    Kept on purpose: all words, numbers, dates, links with text, and footers.
    """
    text = _INVISIBLE.sub("", text.replace("\u00a0", " "))
    # Images: keep the alt text only. A link around an image keeps its URL
    # only if the image has alt text.
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", lambda m: m.group(1).strip(), text)
    text = re.sub(r"\[\s*\]\([^)]*\)", "", text)  # links with no text
    text = _URL.sub(lambda m: _strip_tracking(m.group(0)), text)
    # [https://x](https://x) -> https://x
    text = re.sub(r"\[(https?://[^\]\s]+)\]\(\1\)", r"\1", text)

    out: list[str] = []
    previous = ""
    for line in text.splitlines():
        stripped = line.lstrip("> ")
        prefix = line[: len(line) - len(stripped)]
        body = stripped.rstrip()
        if "|" in body:
            # Separator cells anywhere in the line: "| --- | --- | x | --- |" -> "| x |"
            body = re.sub(r"\|\s*:?-{3,}:?\s*(?=\|)", "", body)
            body = re.sub(r"\|(?:\s*\|)+", "|", body)  # "|  |  | x |" -> "| x |"
            if re.fullmatch(r"[\s|:\-]*", body):  # only pipes, dashes, colons
                body = ""
        if re.fullmatch(r"[-*_=~]{3,}", body.strip()):  # horizontal rule
            body = ""
        body = _DIVIDER_RUN.sub(lambda m: m.group(1) or " ", body)
        if "|" in body:
            body = re.sub(r"\|(?:\s*\|)+", "|", body)  # cells that the step above emptied
            if re.fullmatch(r"[\s|]*", body):
                body = ""
        body = re.sub(r"(?<=\S)[ \t]{2,}", " ", body)  # repeated spaces inside a line
        line_out = prefix + body if body else ""
        if line_out and line_out == previous:
            continue  # repeated identical line (e.g. a repeated "View in browser")
        out.append(line_out)
        previous = line_out
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()


def _html_to_markdown(html: str) -> str:
    try:
        text = _markitdown.convert_stream(BytesIO(html.encode("utf-8")), file_extension=".html").text_content
        cleaned = _clean_markdown(text)
        logger.info("Email text cleaned: %d -> %d characters", len(text), len(cleaned))
        return cleaned
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
            f"{_mailbox_base()}/mailFolders/Inbox/messages",
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
            f"{_mailbox_base()}/messages/{message_id}",
            json={"isRead": True},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
    resp.raise_for_status()


# ── CLI ──────────────────────────────────────────────────────────────────────

def _cli() -> int:
    ap = argparse.ArgumentParser(description="Microsoft 365 mailbox helpers")
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
