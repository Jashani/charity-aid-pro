from __future__ import annotations

from core import storage


class _FakeContainer:
    def __init__(self):
        self.last_upsert = None
        self.query_args = None
        self.raise_on_read = None

    def read_item(self, item, partition_key):
        if self.raise_on_read:
            raise self.raise_on_read
        return {"id": item, "partition_key": partition_key}

    def upsert_item(self, document):
        self.last_upsert = document

    def query_items(self, query, parameters=None, enable_cross_partition_query=False):
        self.query_args = {
            "query": query,
            "parameters": parameters,
            "enable_cross_partition_query": enable_cross_partition_query,
        }
        return [
            {
                "emailId": "msg-123",
                "emailSubject": "Example",
                "id": "opp-1",
                "funderName": "Example Trust",
            }
        ]


def test_email_already_processed_true(monkeypatch):
    container = _FakeContainer()
    monkeypatch.setattr(storage, "get_container", lambda: container)

    assert storage.email_already_processed("msg-123") is True


def test_email_already_processed_false_on_not_found(monkeypatch):
    container = _FakeContainer()

    class _NotFound(Exception):
        pass

    container.raise_on_read = _NotFound("missing")
    monkeypatch.setattr(storage, "get_container", lambda: container)
    monkeypatch.setattr(storage.cosmos_exc, "CosmosResourceNotFoundError", _NotFound)

    assert storage.email_already_processed("msg-404") is False


def test_store_parsed_email_sets_cosmos_id(monkeypatch, sample_parsed_email):
    container = _FakeContainer()
    monkeypatch.setattr(storage, "get_container", lambda: container)

    storage.store_parsed_email(sample_parsed_email)

    assert container.last_upsert is not None
    assert container.last_upsert["id"] == sample_parsed_email.emailId
    assert container.last_upsert["emailId"] == sample_parsed_email.emailId


def test_get_opportunities_applies_filters(monkeypatch):
    container = _FakeContainer()
    monkeypatch.setattr(storage, "get_container", lambda: container)

    results = storage.get_opportunities({"type": "trust", "funderName": "example"})

    assert len(results) == 1
    assert container.query_args is not None
    assert container.query_args["enable_cross_partition_query"] is True
    assert "opp.type = @type" in container.query_args["query"]
    assert "CONTAINS(LOWER(opp.funderName), @funderName)" in container.query_args["query"]
    assert {"name": "@type", "value": "trust"} in container.query_args["parameters"]


def test_store_dead_letter_uses_email_data_and_truncates_body(monkeypatch):
    container = _FakeContainer()
    monkeypatch.setattr(storage, "_ensure_container", lambda *_args, **_kwargs: container)

    long_body = "x" * 4500
    storage.store_dead_letter(
        email_id="msg-dead-1",
        error="parse failed",
        email_data={"subject": "Broken email", "body": long_body},
    )

    assert container.last_upsert is not None
    assert container.last_upsert["id"] == "msg-dead-1"
    assert container.last_upsert["subject"] == "Broken email"
    assert len(container.last_upsert["body"]) == 4000