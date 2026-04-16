from __future__ import annotations

import httpx

from core import email_client


class DummyResponse:
    def __init__(self, status_code: int, payload: dict | None = None, headers: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}
        self.headers = headers or {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=None)

    @property
    def is_success(self) -> bool:
        return 200 <= self.status_code < 300


def test_retry_request_retries_on_429_then_succeeds(monkeypatch):
    calls = {"n": 0}
    sleeps: list[float] = []

    def fake_sleep(seconds: float):
        sleeps.append(seconds)

    def flaky_call():
        calls["n"] += 1
        if calls["n"] == 1:
            return DummyResponse(429, headers={"Retry-After": "0"})
        return DummyResponse(200)

    monkeypatch.setattr(email_client.time, "sleep", fake_sleep)

    response = email_client._retry_request(flaky_call)

    assert response.status_code == 200
    assert calls["n"] == 2
    assert sleeps == [0.0]


def test_retry_request_retries_transport_errors(monkeypatch):
    calls = {"n": 0}

    def fake_sleep(_seconds: float):
        return None

    def flaky_call():
        calls["n"] += 1
        if calls["n"] < 3:
            raise httpx.TransportError("temporary network issue")
        return DummyResponse(200)

    monkeypatch.setattr(email_client.time, "sleep", fake_sleep)

    response = email_client._retry_request(flaky_call)

    assert response.status_code == 200
    assert calls["n"] == 3


def test_fetch_unread_emails_converts_html_body(monkeypatch):
    payload = {
        "value": [
            {
                "id": "msg-1",
                "subject": "HTML email",
                "from": {"emailAddress": {"address": "sender@example.org"}},
                "receivedDateTime": "2026-03-10T09:00:00Z",
                "body": {
                    "contentType": "html",
                    "content": "<html><body><h1>Hello</h1><p>Funding available</p></body></html>",
                },
            }
        ]
    }

    monkeypatch.setattr(email_client, "get_access_token", lambda: "token")
    monkeypatch.setattr(email_client, "_retry_request", lambda *_args, **_kwargs: DummyResponse(200, payload=payload))

    emails = email_client.fetch_unread_emails(max_count=5)

    assert len(emails) == 1
    assert emails[0]["id"] == "msg-1"
    assert "Hello" in emails[0]["body"]
    assert "Funding available" in emails[0]["body"]


def test_move_to_folder_returns_when_folder_create_fails(monkeypatch):
    calls: list[tuple] = []

    def fake_retry(func, *args, **kwargs):
        calls.append((func.__name__, args, kwargs))
        if len(calls) == 1:
            return DummyResponse(200, payload={"value": []})
        if len(calls) == 2:
            return DummyResponse(500)
        return DummyResponse(200)

    monkeypatch.setattr(email_client, "get_access_token", lambda: "token")
    monkeypatch.setattr(email_client, "_retry_request", fake_retry)

    email_client.move_to_folder("msg-2", folder_name="ParseFailed")

    assert len(calls) == 2