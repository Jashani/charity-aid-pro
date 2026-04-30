import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def _sample_opportunity(**overrides) -> dict:
    base = {
        "id": "grant-001",
        "funderName": "Kent Community Foundation",
        "programName": "Community Wellbeing Fund",
        "amount": 5000,
        "amountMax": 10000,
        "type": "trust",
        "deadline": "2026-06-01",
        "location": "Kent",
        "duration": "single-year",
        "durationMonths": 12,
        "status": "identified",
        "score": 0,
        "tags": [],
        "description": "Grants for community wellbeing, older people, and arts organisations",
        "eligibility": "Charities working with isolation and disability in Kent",
        "notes": "",
        "website": "https://example.com",
        "contactName": None,
        "contactEmail": None,
        "source": "manual",
        "extractionConfidence": 0.9,
    }
    base.update(overrides)
    return base


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_score_single_opportunity(client):
    resp = await client.post("/score", json=[_sample_opportunity()])
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1

    result = data[0]
    # Original fields preserved
    assert result["id"] == "grant-001"
    assert result["funderName"] == "Kent Community Foundation"
    # Gating passed
    assert result["gating"]["status"] == "passed"
    # Scores present
    assert result["scores"] is not None
    assert result["final_score"] is not None
    assert 0 <= result["final_score"] <= 100
    # Timing present
    assert result["timing"] is not None
    # Scored timestamp present
    assert result["scored_at"] is not None


@pytest.mark.asyncio
async def test_score_batch(client):
    opps = [
        _sample_opportunity(id="g1"),
        _sample_opportunity(id="g2", amount=50000, amountMax=None),
    ]
    resp = await client.post("/score", json=opps)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["id"] == "g1"
    assert data[1]["id"] == "g2"


@pytest.mark.asyncio
async def test_low_extraction_confidence_needs_review(client):
    opp = _sample_opportunity(extractionConfidence=0.3)
    resp = await client.post("/score", json=[opp])
    data = resp.json()[0]
    assert data["gating"]["status"] == "needs_review"
    # Should still score (needs_review, not failed)
    assert data["scores"] is not None


@pytest.mark.asyncio
async def test_geography_fail_skips_scoring(client):
    opp = _sample_opportunity(location="Scotland")
    resp = await client.post("/score", json=[opp])
    data = resp.json()[0]
    assert data["gating"]["status"] == "failed"
    assert data["scores"] is None
    assert data["final_score"] is None


@pytest.mark.asyncio
async def test_high_value_tag(client):
    opp = _sample_opportunity(amount=50000, amountMax=None)
    resp = await client.post("/score", json=[opp])
    data = resp.json()[0]
    assert "High Value" in data["suggested_tags"]


@pytest.mark.asyncio
async def test_kent_geography_does_not_apply_modifier(client):
    opp = _sample_opportunity(location="Kent")
    resp = await client.post("/score", json=[opp])
    data = resp.json()[0]
    assert data["scores"]["strategic_fit"]["final"] <= data["scores"]["strategic_fit"]["raw"]


@pytest.mark.asyncio
async def test_unknown_deadline_timing_null(client):
    opp = _sample_opportunity(deadline="unknown")
    resp = await client.post("/score", json=[opp])
    data = resp.json()[0]
    assert data["timing"]["score"] is None
