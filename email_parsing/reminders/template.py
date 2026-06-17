"""HTML email templates for batched reminders."""

from __future__ import annotations

from datetime import date
from html import escape
from typing import Any


def _format_date(iso: str) -> str:
    try:
        d = date.fromisoformat(iso)
    except (ValueError, TypeError):
        return iso
    return d.strftime("%-d %B %Y")


def _format_amount(opp: dict[str, Any]) -> str:
    amount = opp.get("amount")
    amount_max = opp.get("amount_max")
    if amount is None:
        return ""
    fmt = lambda n: f"£{int(n):,}"
    if amount_max is not None and float(amount_max) > float(amount):
        return f"{fmt(amount)} – {fmt(amount_max)}"
    return fmt(amount)


def _card(rows: list[tuple[str, str]], headline: str) -> str:
    """Render a single opportunity card."""
    row_html = "".join(
        f"<p style='margin:2px 0;font-size:12px'><strong>{escape(k)}:</strong> {escape(v)}</p>"
        for k, v in rows
    )
    return f"""
<div style="background:#f4f4f5;border-radius:12px;padding:12px;margin:12px 0;">
  <p style="margin:0 0 6px;font-size:13px;font-weight:600">{escape(headline)}</p>
  {row_html}
</div>"""


def _wrap(body_content: str) -> str:
    return (
        '<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,'
        'sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:20px;">'
        + body_content
        + "<p style='color:#71717a;font-size:12px;margin-top:24px'>— Charity Aid Pro</p>"
        "</body></html>"
    )


# ---------------------------------------------------------------------------
# Deadline reminders
# ---------------------------------------------------------------------------

def render_deadline(items: list[tuple[dict[str, Any], int]]) -> tuple[str, str]:
    """items: list of (opp, days_left)."""
    n = len(items)
    subject = f"⏰ {n} grant deadline{'s' if n > 1 else ''} approaching"

    cards = ""
    for opp, days_left in sorted(items, key=lambda x: x[1]):
        title = f"{opp.get('funder_name') or ''} — {opp.get('program_name') or '(untitled)'}".strip(" —")
        rows = []
        if amt := _format_amount(opp):
            rows.append(("Amount", amt))
        if dl := opp.get("deadline"):
            rows.append(("Deadline", _format_date(dl)))
        if st := opp.get("status"):
            rows.append(("Status", st.replace("_", " ").title()))
        headline = f"{title} — {days_left} {'day' if days_left == 1 else 'days'} left"
        cards += _card(rows, headline)

    intro = (
        f"<p>Hi team,</p>"
        f"<p>You have <strong>{n} grant deadline{'s' if n > 1 else ''}</strong> approaching:</p>"
    )
    return subject, _wrap(intro + cards)


# ---------------------------------------------------------------------------
# Results chase reminders
# ---------------------------------------------------------------------------

def render_results_chase(items: list[tuple[dict[str, Any], int]]) -> tuple[str, str]:
    """items: list of (opp, days_relative) where negative = overdue."""
    n = len(items)
    subject = f"📋 {n} submitted grant{'s' if n > 1 else ''} awaiting decision — chase up?"

    cards = ""
    for opp, days_rel in sorted(items, key=lambda x: x[1]):
        title = f"{opp.get('funder_name') or ''} — {opp.get('program_name') or '(untitled)'}".strip(" —")
        if days_rel < 0:
            timing = f"Decision date was {abs(days_rel)} {'day' if abs(days_rel) == 1 else 'days'} ago"
        elif days_rel == 0:
            timing = "Decision expected today"
        else:
            timing = f"Decision expected in {days_rel} {'day' if days_rel == 1 else 'days'}"
        rows = []
        if rd := opp.get("expected_results_date"):
            rows.append(("Expected date", _format_date(rd)))
        if amt := _format_amount(opp):
            rows.append(("Amount", amt))
        if st := opp.get("status"):
            rows.append(("Status", st.replace("_", " ").title()))
        cards += _card(rows, f"{title} — {timing}")

    intro = (
        "<p>Hi team,</p>"
        "<p>The following submitted grants are awaiting a decision — "
        "it may be worth reaching out to the funders for a status update:</p>"
    )
    return subject, _wrap(intro + cards)


# ---------------------------------------------------------------------------
# Stale opportunity reminders
# ---------------------------------------------------------------------------

def render_stale_opportunity(items: list[tuple[dict[str, Any], int]]) -> tuple[str, str]:
    """items: list of (opp, days_stale)."""
    n = len(items)
    subject = f"🔄 {n} opportunit{'ies' if n > 1 else 'y'} with no recent activity"

    cards = ""
    for opp, days_stale in sorted(items, key=lambda x: -x[1]):
        title = f"{opp.get('funder_name') or ''} — {opp.get('program_name') or '(untitled)'}".strip(" —")
        rows = []
        if st := opp.get("status"):
            rows.append(("Status", st.replace("_", " ").title()))
        if dl := opp.get("deadline"):
            rows.append(("Deadline", _format_date(dl)))
        if amt := _format_amount(opp):
            rows.append(("Amount", amt))
        headline = f"{title} — no activity for {days_stale} days"
        cards += _card(rows, headline)

    intro = (
        "<p>Hi team,</p>"
        f"<p><strong>{n} opportunit{'ies' if n > 1 else 'y'}</strong> "
        "in your pipeline haven't been updated recently. "
        "Worth a quick review:</p>"
    )
    return subject, _wrap(intro + cards)


# ---------------------------------------------------------------------------
# Funding expiry reminders
# ---------------------------------------------------------------------------

def render_funding_expiry(items: list[tuple[dict[str, Any], int]]) -> tuple[str, str]:
    """items: list of (opp, days_left)."""
    n = len(items)
    subject = f"⚠️ {n} active grant{'s' if n > 1 else ''} expiring soon"

    cards = ""
    for opp, days_left in sorted(items, key=lambda x: x[1]):
        title = f"{opp.get('funder_name') or ''} — {opp.get('program_name') or '(untitled)'}".strip(" —")
        rows = []
        if exp := opp.get("expiration_date"):
            rows.append(("Expires", _format_date(exp)))
        if amt := opp.get("amount_awarded") or opp.get("amount"):
            rows.append(("Amount", f"£{int(amt):,}"))
        headline = f"{title} — expires in {days_left} {'day' if days_left == 1 else 'days'}"
        cards += _card(rows, headline)

    intro = (
        "<p>Hi team,</p>"
        f"<p>The following active grants are <strong>expiring soon</strong>. "
        "Consider planning for renewal or replacement funding:</p>"
    )
    return subject, _wrap(intro + cards)
