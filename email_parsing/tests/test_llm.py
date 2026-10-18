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
                "funder_name": "Foo",
                "program_name": None,
                "amount": None,
                "amount_max": 5000,
                "type": "trust",
                "deadline": "2026-12-31",
                "location": "UK",
                "duration_months": None,
                "capital_cost": True,
                "description": "Test",
                "notes": "",
                "website": "https://example.com",
                "contact_name": None,
                "contact_email": None,
            }
        ],
    }
    import json

    monkeypatch.setattr(llm, "_chat", lambda system, user, *, stage, schema: json.dumps(payload))
    result = llm.parse_email({"id": "test", "subject": "x", "body": "y"})
    assert result.classification == "FUNDING_OPPORTUNITY"
    assert len(result.opportunities) == 1
    opp = result.opportunities[0]
    assert opp.funder_name == "Foo"
    assert opp.id == "opp-0"
    assert opp.program_name == "Unknown"
    assert opp.amount == 0
    assert opp.duration_months == 12
    assert opp.tags == ["Capital Cost"]


def test_strict_schema_requires_all_keys():
    schema = llm._strict(llm.PARSE_SCHEMA)
    assert schema["additionalProperties"] is False
    assert schema["required"] == ["classification", "confidence", "opportunities"]
    item = schema["properties"]["opportunities"]["items"]
    assert item["additionalProperties"] is False
    assert set(item["required"]) == set(item["properties"])


def test_prompts_include_profile():
    for name in ("parse", "score"):
        text = llm.load_prompt(name)
        assert "{{" not in text
        assert "Music4Wellbeing" in text
    assert "{{" not in llm.load_prompt("geography")


def test_parse_email_irrelevant_no_opps(monkeypatch):
    import json

    monkeypatch.setattr(
        llm,
        "_chat",
        lambda system, user, *, stage, schema: json.dumps(
            {"classification": "IRRELEVANT", "confidence": 0.95, "opportunities": []}
        ),
    )
    result = llm.parse_email({"id": "test", "subject": "spam", "body": ""})
    assert result.classification == "IRRELEVANT"
    assert result.opportunities == []
