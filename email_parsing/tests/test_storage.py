from __future__ import annotations

import json

import httpx
import pytest

from email_parsing import config, storage


@pytest.fixture
def airtable(monkeypatch):
    """Fake Airtable API. Returns the list of create payloads it received."""
    created: list[dict] = []
    state = {"existing": []}

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.method == "GET" and path.endswith(config.AIRTABLE_ORGANISATIONS_TABLE):
            return httpx.Response(200, json={"records": [
                {"id": "recOrg1", "fields": {"Name": "The Example Trust"}},
                {"id": "recOrg2", "fields": {"Name": "Other Funder"}},
            ]})
        if request.method == "GET" and path.endswith(config.AIRTABLE_OPPORTUNITIES_TABLE):
            assert "msg-123#" in request.url.params["filterByFormula"]
            return httpx.Response(200, json={"records": [
                {"id": f"rec{i}", "fields": {"Source ID": sid}}
                for i, sid in enumerate(state["existing"])
            ]})
        if request.method == "POST":
            created.append(json.loads(request.content))
            return httpx.Response(200, json={"records": []})
        return httpx.Response(404)

    client = httpx.Client(base_url="https://api.airtable.test/v0/app", transport=httpx.MockTransport(handler))
    monkeypatch.setattr(storage, "_client", lambda: client)
    storage._organisation_index.cache_clear()
    yield created, state
    storage._organisation_index.cache_clear()


def test_normalise_org_name():
    assert storage.normalise_org_name("  The Salters’  Foundation ") == "salters' foundation"
    assert storage.normalise_org_name("") == ""


def test_opp_to_fields_maps_values(airtable, opportunity, parsed_email):
    opportunity.contact_email = "not an email"
    opportunity.gating = {
        "status": "passed",
        "geography": {"pass": True, "reasoning": "Kent"},
        "score": {"pass": True, "activity_score": 70, "audience_score": 90, "reasoning": "Good fit"},
    }
    opportunity.final_score = 82

    fields = storage.opp_to_fields(opportunity, parsed_email, "msg-123#0")

    assert fields["Opportunity"] == "Community Wellbeing Fund – Example Trust"
    assert fields["Status"] == "New"
    assert fields["Score"] == 82
    assert fields["Deadline"] == "2026-07-01"
    assert fields["Funding Type"] == "Trust"
    assert fields["Gating"] == "Passed"
    assert fields["Activity Score"] == 70
    assert fields["Score Reasoning"] == "Good fit"
    assert fields["Organisation"] == ["recOrg1"]
    assert fields["Email From"] == "alerts@example.org"
    assert fields["Source ID"] == "msg-123#0"
    # Invalid email and empty values are left out.
    assert "Contact Email" not in fields
    assert "Notes" not in fields


def test_opp_to_fields_keeps_unparseable_deadline_in_notes(airtable, opportunity, parsed_email):
    opportunity.deadline = "end of March"
    fields = storage.opp_to_fields(opportunity, parsed_email, "msg-123#0")
    assert "Deadline" not in fields
    assert fields["Notes"] == "Deadline as written: end of March"


def test_opp_to_fields_unknown_deadline_left_blank(airtable, opportunity, parsed_email):
    opportunity.deadline = "unknown"
    fields = storage.opp_to_fields(opportunity, parsed_email, "msg-123#0")
    assert "Deadline" not in fields
    assert "Notes" not in fields


def test_opp_to_fields_geography_failure(airtable, opportunity, parsed_email):
    opportunity.funder_name = "Unlisted Funder"
    opportunity.gating = {
        "status": "failed",
        "geography": {"pass": False, "reasoning": "Scotland only"},
        "score": {"pass": False, "reasoning": "Skipped — geography hard fail"},
    }
    fields = storage.opp_to_fields(opportunity, parsed_email, "msg-123#0")
    assert fields["Gating"] == "Failed"
    assert fields["Score Reasoning"] == "Geography check failed: Scotland only"
    assert "Organisation" not in fields


def test_store_creates_only_new_records(airtable, opportunity, parsed_email):
    created, state = airtable
    second = opportunity.model_copy(update={"program_name": "Second Fund"})
    parsed_email.opportunities = [opportunity, second]
    state["existing"] = ["msg-123#0"]

    assert storage.store_parsed_email(parsed_email) == 1

    assert len(created) == 1
    assert created[0]["typecast"] is True
    [record] = created[0]["records"]
    assert record["fields"]["Source ID"] == "msg-123#1"


def test_store_batches_by_ten(airtable, opportunity, parsed_email):
    created, _ = airtable
    parsed_email.opportunities = [opportunity] * 12

    assert storage.store_parsed_email(parsed_email) == 12
    assert [len(c["records"]) for c in created] == [10, 2]


def test_store_no_opportunities_makes_no_requests(airtable, parsed_email):
    created, _ = airtable
    parsed_email.opportunities = []
    assert storage.store_parsed_email(parsed_email) == 0
    assert created == []


def test_email_already_stored(airtable):
    _, state = airtable
    assert storage.email_already_stored("msg-123") is False
    state["existing"] = ["msg-123#0"]
    assert storage.email_already_stored("msg-123") is True
