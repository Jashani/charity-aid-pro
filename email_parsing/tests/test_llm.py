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
                "amount_min": None,
                "amount_max": 5000,
                "amount_typical": None,
                "type": "trust_foundation",
                "deadline": "2026-12-31",
                "location": "UK",
                "duration_months": None,
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
    assert opp.amount_min is None
    assert opp.amount_typical is None
    assert opp.duration_months is None


def _opp_item(**over):
    item = {
        "funder_name": "Foo", "program_name": "Bar", "amount_min": None, "amount_max": None,
        "amount_typical": None, "type": "trust_foundation", "deadline": "unknown",
        "location": "UK", "duration_months": None, "description": "Test", "notes": "",
        "website": None, "contact_name": None, "contact_email": None,
    }
    item.update(over)
    return item


def test_typical_amount_is_midpoint_of_range():
    assert llm._to_opportunity(_opp_item(amount_min=2500, amount_max=5000), 0).amount_typical == 3750
    stated = _opp_item(amount_min=2500, amount_max=5000, amount_typical=3000)
    assert llm._to_opportunity(stated, 0).amount_typical == 3000
    assert llm._to_opportunity(_opp_item(amount_max=5000), 0).amount_typical is None


def test_newsletter_and_forwarder_contacts_are_removed(monkeypatch):
    import json

    payload = {"classification": "FUNDING_OPPORTUNITY", "confidence": 0.9, "opportunities": [
        _opp_item(funder_name="A", contact_name="Editor", contact_email="news@idoxgroup.com"),
        _opp_item(funder_name="B", contact_name="Gemma", contact_email="gemma@music4wellbeing.org.uk"),
        _opp_item(funder_name="C", contact_name="Sam", contact_email="sam@forwarder.example"),
        _opp_item(funder_name="D", contact_name="Jo", contact_email="grants@fund.example"),
    ]}
    monkeypatch.setattr(llm, "_chat", lambda system, user, *, stage, schema: json.dumps(payload))
    result = llm.parse_email({"id": "t", "subject": "x", "body": "y", "from": "sam@forwarder.example"})
    contacts = [(o.contact_name, o.contact_email) for o in result.opportunities]
    assert contacts == [(None, None), (None, None), (None, None), ("Jo", "grants@fund.example")]


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


def test_parse_email_drops_repeated_opportunity(monkeypatch):
    import json

    opp = _opp_item(funder_name="Road Fund", program_name="Safer Roads")
    payload = {"classification": "FUNDING_OPPORTUNITY", "confidence": 0.9, "opportunities": [opp, dict(opp)]}
    monkeypatch.setattr(llm, "_chat", lambda system, user, *, stage, schema: json.dumps(payload))
    result = llm.parse_email({"id": "test", "subject": "x", "body": "y"})
    assert len(result.opportunities) == 1


def test_chat_retries_once_on_schema_failure(monkeypatch):
    from types import SimpleNamespace

    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise RuntimeError("Error code: 400 - json_validate_failed")
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"pass": true}'))])

    fake = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    monkeypatch.setattr(llm, "_client", lambda: fake)
    assert llm._chat("s", "u", stage="t", schema={"type": "object", "properties": {}}) == '{"pass": true}'
    assert len(calls) == 2
