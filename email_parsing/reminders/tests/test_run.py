from datetime import date

from email_parsing.reminders.run import _days_until, _parse_date
from email_parsing.reminders.template import (
    render_deadline,
    render_results_chase,
    render_stale_opportunity,
    render_funding_expiry,
)


def test_parse_date_ok():
    assert _parse_date("2026-06-30") == date(2026, 6, 30)


def test_parse_date_bad():
    assert _parse_date("unknown") is None
    assert _parse_date("") is None
    assert _parse_date("not-a-date") is None
    assert _parse_date(None) is None


def test_days_until():
    assert _days_until(date(2026, 6, 30), date(2026, 6, 23)) == 7
    assert _days_until(date(2026, 6, 23), date(2026, 6, 23)) == 0
    assert _days_until(date(2026, 6, 20), date(2026, 6, 23)) == -3


def test_render_deadline_batch():
    opp = {
        "funder_name": "Youth Music",
        "program_name": "Incubator Fund",
        "deadline": "2026-03-28",
        "amount": 2000,
        "amount_max": 30000,
        "status": "applying",
    }
    subject, html = render_deadline([(opp, 20)])
    assert "Youth Music" in html and "Incubator Fund" in html
    assert "20 days" in html
    assert "£2,000 – £30,000" in html
    assert "28 March 2026" in html
    assert "Applying" in html
    assert "approaching" in subject


def test_render_deadline_singular():
    opp = {"funder_name": "X", "program_name": "Y", "deadline": "2026-06-03"}
    subject, _ = render_deadline([(opp, 1)])
    assert "1 grant deadline approaching" in subject


def test_render_deadline_multiple():
    opp1 = {"funder_name": "A", "program_name": "P1", "deadline": "2026-07-01"}
    opp2 = {"funder_name": "B", "program_name": "P2", "deadline": "2026-07-15"}
    subject, html = render_deadline([(opp1, 14), (opp2, 28)])
    assert "2 grant deadlines" in subject
    assert "A" in html and "B" in html


def test_render_results_chase_overdue():
    opp = {
        "funder_name": "Arts Council",
        "program_name": "Project Grants",
        "expected_results_date": "2026-06-10",
        "amount": 5000,
        "status": "submitted",
    }
    subject, html = render_results_chase([(opp, -7)])
    assert "awaiting decision" in subject
    assert "7 days ago" in html


def test_render_stale_opportunity():
    opp = {
        "funder_name": "Lottery",
        "program_name": "Community Fund",
        "status": "researching",
        "deadline": "2026-09-01",
    }
    subject, html = render_stale_opportunity([(opp, 30)])
    assert "no recent activity" in subject
    assert "30 days" in html


def test_render_funding_expiry():
    opp = {
        "funder_name": "DCMS",
        "program_name": "Cultural Recovery",
        "expiration_date": "2026-09-30",
        "amount_awarded": 20000,
        "status": "awarded",
    }
    subject, html = render_funding_expiry([(opp, 30)])
    assert "expiring soon" in subject
    assert "30 days" in html
    assert "£20,000" in html
