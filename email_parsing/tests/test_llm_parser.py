from __future__ import annotations

from dataclasses import dataclass

import pytest

from core import llm_parser
from core.schema import ClassificationResult, FundingOpportunity


@dataclass
class _FakeMessage:
    content: str


@dataclass
class _FakeChoice:
    message: _FakeMessage


@dataclass
class _FakeResponse:
    choices: list[_FakeChoice]


class _FakeCompletions:
    def __init__(self, events):
        self._events = list(events)
        self.calls = 0

    def create(self, **_kwargs):
        self.calls += 1
        event = self._events.pop(0)
        if isinstance(event, Exception):
            raise event
        return _FakeResponse(choices=[_FakeChoice(message=_FakeMessage(content=event))])


class _FakeChat:
    def __init__(self, events):
        self.completions = _FakeCompletions(events)


class _FakeClient:
    def __init__(self, events):
        self.chat = _FakeChat(events)


class _RetryableError(Exception):
    status_code = 429


class _FatalError(Exception):
    status_code = 400


def test_parse_json_response_repairs_invalid_json_once():
    retry_client = _FakeClient([
        '{"classification":"IRRELEVANT","confidence":0.99,"reason":"No funding info"}'
    ])
    messages = [{"role": "user", "content": "prompt"}]

    result = llm_parser._parse_json_response(
        raw='{"classification": "IRRELEVANT"',
        retry_with_client=retry_client,
        deployment="gpt-4o-mini",
        messages=messages,
    )

    assert result["classification"] == "IRRELEVANT"
    assert result["confidence"] == 0.99


def test_parse_json_response_raises_output_error_after_failed_repair():
    retry_client = _FakeClient(['{"still": invalid json'])

    with pytest.raises(llm_parser.LLMOutputError):
        llm_parser._parse_json_response(
            raw='{"broken":',
            retry_with_client=retry_client,
            deployment="gpt-4o-mini",
            messages=[{"role": "user", "content": "prompt"}],
            stage="extract",
            email_id="msg-1",
        )


def test_chat_completion_with_retry_retries_transient_errors(monkeypatch):
    sleep_calls = []
    monkeypatch.setattr(llm_parser.time, "sleep", lambda seconds: sleep_calls.append(seconds))
    monkeypatch.setattr(llm_parser.random, "uniform", lambda _a, _b: 0.0)

    client = _FakeClient([_RetryableError("rate limited"), "{\"ok\": true}"])

    response = llm_parser._chat_completion_with_retry(
        client,
        deployment="gpt-4o-mini",
        messages=[{"role": "user", "content": "prompt"}],
        stage="classify",
    )

    assert response.choices[0].message.content == '{"ok": true}'
    assert client.chat.completions.calls == 2
    assert sleep_calls == [1.0]


def test_chat_completion_with_retry_fails_fast_for_non_retryable_error():
    client = _FakeClient([_FatalError("bad request")])

    with pytest.raises(llm_parser.LLMInvocationError):
        llm_parser._chat_completion_with_retry(
            client,
            deployment="gpt-4o-mini",
            messages=[{"role": "user", "content": "prompt"}],
            stage="extract",
            email_id="msg-1",
        )


def test_parse_email_escalates_classification_when_confidence_low(monkeypatch, sample_email_data):
    sequence = [
        ClassificationResult(
            classification="FUNDING_OPPORTUNITY",
            confidence=0.4,
            reason="uncertain",
        ),
        ClassificationResult(
            classification="IRRELEVANT",
            confidence=0.95,
            reason="follow-up classified confidently",
        ),
    ]

    def fake_classify(_subject: str, _body: str, model: str = "mini"):
        if model == "mini":
            return sequence[0]
        return sequence[1]

    monkeypatch.setattr(llm_parser, "classify_email", fake_classify)
    monkeypatch.setattr(llm_parser, "extract_opportunities", lambda *_args, **_kwargs: [])

    parsed = llm_parser.parse_email(sample_email_data)

    assert parsed.classification == "IRRELEVANT"
    assert parsed.modelUsed == llm_parser.config.AZURE_OPENAI_DEPLOYMENT_FULL
    assert parsed.opportunities == []


def test_parse_email_escalates_extraction_when_opportunity_confidence_low(monkeypatch, sample_email_data):
    low_conf = FundingOpportunity(
        id="opp-1",
        funderName="Example Trust",
        programName="Small Grants",
        amount=5000,
        type="trust",
        deadline="2026-06-01",
        location="UK",
        duration="single-year",
        durationMonths=12,
        relationship="new",
        status="identified",
        score=70,
        tags=[],
        description="desc",
        eligibility="eligibility",
        notes="",
        website="https://example.org",
        source="email:msg-123",
        extractionConfidence=0.4,
    )
    high_conf = low_conf.model_copy(update={"extractionConfidence": 0.95})

    monkeypatch.setattr(
        llm_parser,
        "classify_email",
        lambda *_args, **_kwargs: ClassificationResult(
            classification="FUNDING_OPPORTUNITY", confidence=0.9, reason="relevant"
        ),
    )

    calls = {"n": 0}

    def fake_extract(_subject: str, _body: str, email_id: str = "", model: str = "mini"):
        calls["n"] += 1
        if model == "mini":
            return [low_conf]
        return [high_conf]

    monkeypatch.setattr(llm_parser, "extract_opportunities", fake_extract)

    parsed = llm_parser.parse_email(sample_email_data)

    assert calls["n"] == 2
    assert len(parsed.opportunities) == 1
    assert parsed.opportunities[0].extractionConfidence == 0.95
    assert parsed.modelUsed == llm_parser.config.AZURE_OPENAI_DEPLOYMENT_FULL


def test_parse_email_fail_open_on_escalated_classification_failure(monkeypatch, sample_email_data):
    monkeypatch.setattr(llm_parser, "_CLASSIFICATION_FAIL_OPEN", True)
    monkeypatch.setattr(
        llm_parser,
        "classify_email",
        lambda *_args, model="mini", **_kwargs: (
            ClassificationResult(
                classification="FUNDING_OPPORTUNITY",
                confidence=0.5,
                reason="low confidence",
            )
            if model == "mini"
            else (_ for _ in ()).throw(llm_parser.LLMInvocationError("full failed"))
        ),
    )
    monkeypatch.setattr(llm_parser, "extract_opportunities", lambda *_args, **_kwargs: [])

    parsed = llm_parser.parse_email(sample_email_data)

    assert parsed.classification == "IRRELEVANT"
    assert parsed.classificationConfidence == 0.0
    assert parsed.opportunities == []