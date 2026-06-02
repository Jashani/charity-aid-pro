"""HTML email templates. Mirrors the preview in src/pages/Reminders.tsx."""

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


def render_deadline(opp: dict[str, Any], days_left: int) -> tuple[str, str]:
    """Render the (subject, html) for a deadline reminder."""
    funder = opp.get("funder_name") or ""
    program = opp.get("program_name") or "(untitled)"
    deadline = opp.get("deadline") or ""
    status = opp.get("status") or ""
    amount_str = _format_amount(opp)
    deadline_pretty = _format_date(deadline)

    title = f"{funder} — {program}" if funder else program
    subject = f"⏰ Deadline: {title} ({days_left} {'day' if days_left == 1 else 'days'})"

    detail_rows = [
        ("Deadline", deadline_pretty),
        ("Status", status.replace("_", " ").title()) if status else None,
    ]
    if amount_str:
        detail_rows.insert(0, ("Amount", amount_str))
    detail_html = "".join(
        f"<p style='margin:2px 0;font-size:12px'><strong>{escape(label)}:</strong> {escape(value)}</p>"
        for row in detail_rows if row for label, value in [row]
    )

    body = f"""\
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:20px;">
  <p>Hi team,</p>
  <p>The <strong>{escape(title)}</strong> deadline is in
     <strong>{days_left} {'day' if days_left == 1 else 'days'}</strong>
     ({escape(deadline_pretty)}).</p>
  <div style="background:#f4f4f5;border-radius:12px;padding:12px;margin:12px 0;">
    {detail_html}
  </div>
  <p style="color:#71717a;font-size:12px;">— Charity Aid Pro</p>
</body></html>
"""
    return subject, body
