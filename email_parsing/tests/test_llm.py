from __future__ import annotations

import pytest

from email_parsing import llm


def test_strip_fences_handles_json_block():
    raw = "```json\n{\"a\": 1}\n```"
    assert llm._strip_fences(raw) == '{"a": 1}'


def test_strip_fences_handles_plain():
    assert llm._strip_fences("{\"a\": 1}") == '{"a": 1}'


def test_parse_json_invalid_raises():
    with pytest.raises(llm.LLMError):
        llm._parse_json("not json", stage="test")


def test_parse_email_envelope(monkeypatch):
    payload = {
        "classification": "FUNDING_OPPORTUNITY",
        "confidence": 0.9,
        "opportunities": [
            {
                "id": "opp-1",
                "funder_name": "Foo",
                "program_name": "Bar",
                "amount": 1000,
                "amount_max": 5000,
                "type": "trust",
                "deadline": "2026-12-31",
                "location": "UK",
                "duration_months": 12,
                "status": "identified",
                "description": "Test",
                "website": "https://example.com",
            }
        ],
    }
    import json

    monkeypatch.setattr(llm, "_chat", lambda prompt, *, stage: json.dumps(payload))
    result = llm.parse_email({"id": "test", "subject": "x", "body": "y"})
    assert result.classification == "FUNDING_OPPORTUNITY"
    assert len(result.opportunities) == 1
    assert result.opportunities[0].funder_name == "Foo"


def test_parse_email_irrelevant_no_opps(monkeypatch):
    import json

    monkeypatch.setattr(
        llm,
        "_chat",
        lambda prompt, *, stage: json.dumps(
            {"classification": "IRRELEVANT", "confidence": 0.95, "opportunities": []}
        ),
    )
    result = llm.parse_email({"id": "test", "subject": "spam", "body": ""})
    assert result.classification == "IRRELEVANT"
    assert result.opportunities == []
