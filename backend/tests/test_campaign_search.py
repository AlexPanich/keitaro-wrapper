"""Поиск кампании Keitaro для редактора: `GET /api/keitaro/campaigns?q=`."""

import pytest

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def campaigns(keitaro):
    keitaro.campaigns = {
        101: {"id": 101, "name": "Germany Main", "state": "active", "alias": "a1", "group": "G"},
        2101: {"id": 2101, "name": "france test", "state": "disabled", "alias": "a2", "group": "G"},
        303: {"id": 303, "name": "Other", "state": "active", "alias": "a3", "group": "G"},
    }


async def test_search_by_name_substring_ignores_case(client):
    res = await client.get("/api/keitaro/campaigns", params={"q": "GERMANY"})

    assert res.status_code == 200
    assert res.json() == [{"id": 101, "name": "Germany Main", "state": "active"}]


async def test_search_by_id_matches_exact_id(client):
    res = await client.get("/api/keitaro/campaigns", params={"q": " 101 "})

    assert [c["id"] for c in res.json()] == [101]


async def test_empty_query_returns_all_campaigns(client):
    res = await client.get("/api/keitaro/campaigns")

    assert [c["id"] for c in res.json()] == [101, 2101, 303]
