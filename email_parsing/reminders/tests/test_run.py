from datetime import date

from email_parsing.reminders.run import _days_until, _parse_deadline
from email_parsing.reminders.template import render_deadline


def test_parse_deadline_ok():
    assert _parse_deadline("2026-06-30") == date(2026, 6, 30)


def test_parse_deadline_bad():
    assert _parse_deadline("unknown") is None
    assert _parse_deadline("") is None
    assert _parse_deadline("not-a-date") is None


def test_days_until():
    assert _days_until(date(2026, 6, 30), date(2026, 6, 23)) == 7
    assert _days_until(date(2026, 6, 23), date(2026, 6, 23)) == 0
    assert _days_until(date(2026, 6, 20), date(2026, 6, 23)) == -3


def test_render_deadline_subject_and_html():
    opp = {
        "funder_name": "Youth Music",
        "program_name": "Incubator Fund",
        "deadline": "2026-03-28",
        "amount": 2000,
        "amount_max": 30000,
        "status": "applying",
    }
    subject, html = render_deadline(opp, days_left=20)
    assert "Youth Music" in subject and "Incubator Fund" in subject
    assert "20 days" in subject
    assert "£2,000 – £30,000" in html
    assert "28 March 2026" in html
    assert "Applying" in html


def test_render_deadline_singular_day():
    opp = {"funder_name": "X", "program_name": "Y", "deadline": "2026-06-03"}
    subject, _ = render_deadline(opp, days_left=1)
    assert "1 day)" in subject
