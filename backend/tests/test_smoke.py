import pytest

pytestmark = pytest.mark.anyio


async def test_health(client):
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


async def test_openapi_schema(client):
    res = await client.get("/openapi.json")
    assert res.status_code == 200
    assert "/api/campaigns" in res.json()["paths"]


async def test_keitaro_offers(client):
    res = await client.get("/api/keitaro/offers")
    assert res.status_code == 200
    assert res.json() == [{"id": 1, "name": "Offer A"}, {"id": 2, "name": "Offer B"}]
