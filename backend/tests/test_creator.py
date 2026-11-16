"""Создаватор: кампания с гео-потоком и оффер-потоком (#20)."""

import re

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models import Campaign
from app.schemas.error import KeitaroDetails
from app.services.keitaro import KeitaroError

pytestmark = pytest.mark.anyio


@pytest.fixture
def keitaro(keitaro):
    """Keitaro со справочниками, в которых есть всё, что выбирает форма."""
    keitaro.offers = [{"id": 7, "name": "Offer 7", "state": "active"}]
    keitaro.groups = [{"id": 3, "name": "Тестовые"}]
    keitaro.domains = [{"id": 4, "name": "go.example.com"}]
    keitaro.traffic_sources = [{"id": 5, "name": "Facebook"}]
    return keitaro


def form(**overrides) -> dict:
    return {
        "name": "wayfinder-test",
        "geo": "DE, FR",
        "offer_id": 7,
        "group_id": 3,
        "domain_id": 4,
        "traffic_source_id": 5,
        **overrides,
    }


def created(keitaro, method: str) -> list[dict]:
    return [payload for name, payload in keitaro.calls if name == method]


async def test_creates_campaign_with_geo_and_offer_streams(client, keitaro, session):
    res = await client.post("/api/campaigns", json=form())

    assert res.status_code == 201, res.text
    [campaign] = created(keitaro, "create_campaign")
    assert re.fullmatch(r"[a-z0-9]{8}", campaign["alias"])
    assert campaign == {
        "name": "wayfinder-test",
        "alias": campaign["alias"],
        "group_id": 3,
        "domain_id": 4,
        "traffic_source_id": 5,
    }
    campaign_id = 101  # первый id, который выдаёт FakeKeitaro
    geo_stream, offer_stream = created(keitaro, "create_stream")
    assert geo_stream == {
        "campaign_id": campaign_id,
        "type": "regular",
        "name": geo_stream["name"],
        "position": 1,
        "schema": "redirect",
        "action_type": "http",
        "action_payload": settings.fallback_redirect_url,
        "filters": [{"name": "country", "mode": "accept", "payload": ["DE", "FR"]}],
    }
    assert offer_stream == {
        "campaign_id": campaign_id,
        "type": "regular",
        "name": offer_stream["name"],
        "position": 2,
        "schema": "landings",
        "action_type": "http",
        "offers": [{"offer_id": 7, "share": 100}],
    }

    body = res.json()
    assert body["alias"] == campaign["alias"]
    assert body["url"] == f"https://go.example.com/{campaign['alias']}"

    [row] = (await session.scalars(select(Campaign))).all()
    assert row.keitaro_id == campaign_id
    assert row.geo == ["DE", "FR"]
    assert (row.geo_stream_id, row.offer_stream_id) == (102, 103)
    assert (row.initial_offer_id, row.group_id, row.domain_id, row.traffic_source_id) == (7, 3, 4, 5)
    assert row.alias == campaign["alias"]


async def test_not_selected_domain_and_source(client, keitaro):
    res = await client.post("/api/campaigns", json=form(domain_id=None, traffic_source_id=None))

    assert res.status_code == 201, res.text
    [campaign] = created(keitaro, "create_campaign")
    assert campaign["domain_id"] is None
    assert campaign["traffic_source_id"] == 0
    body = res.json()
    assert body["url"] is None
    assert (body["domain_id"], body["traffic_source_id"]) == (None, None)


async def test_name_and_geo_are_normalized(client, keitaro, session):
    res = await client.post("/api/campaigns", json=form(name="  wayfinder  ", geo=" de,fr , DE,it "))

    assert res.status_code == 201, res.text
    [campaign] = created(keitaro, "create_campaign")
    assert campaign["name"] == "wayfinder"
    geo_stream = created(keitaro, "create_stream")[0]
    assert geo_stream["filters"][0]["payload"] == ["DE", "FR", "IT"]
    assert res.json()["geo"] == ["DE", "FR", "IT"]


@pytest.mark.parametrize(
    ("overrides", "field", "message"),
    [
        ({"name": ""}, "name", "Обязательное поле"),
        ({"name": "   "}, "name", "Обязательное поле"),
        ({"offer_id": None}, "offer_id", "Обязательное поле"),
        ({"geo": ""}, "geo", "Укажите хотя бы одну страну"),
        ({"geo": " , ,"}, "geo", "Укажите хотя бы одну страну"),
        ({"geo": "de, xx, RUS, zz, xx"}, "geo", "Неизвестные коды: XX, RUS, ZZ"),
    ],
)
async def test_form_checked_before_keitaro(client, keitaro, session, overrides, field, message):
    res = await client.post("/api/campaigns", json=form(**overrides))

    assert res.status_code == 422
    body = res.json()
    assert body["code"] == "validation_error"
    assert body["fields"] == {field: message}
    assert keitaro.calls == []
    assert (await session.scalars(select(Campaign))).all() == []


@pytest.mark.parametrize(
    ("overrides", "field", "message"),
    [
        ({"group_id": 99}, "group_id", "Группы #99 нет в Keitaro"),
        ({"domain_id": 99}, "domain_id", "Домена #99 нет в Keitaro"),
        ({"traffic_source_id": 99}, "traffic_source_id", "Источника #99 нет в Keitaro"),
        ({"offer_id": 99}, "offer_id", "Оффера #99 нет в Keitaro"),
    ],
)
async def test_keitaro_ids_checked_before_any_write(client, keitaro, session, overrides, field, message):
    res = await client.post("/api/campaigns", json=form(**overrides))

    assert res.status_code == 422
    body = res.json()
    assert body["code"] == "validation_error"
    assert body["fields"] == {field: message}
    assert keitaro.writes() == []
    assert (await session.scalars(select(Campaign))).all() == []


async def test_disabled_offer_is_accepted(client, keitaro):
    keitaro.offers = [{"id": 7, "name": "Offer 7", "state": "disabled"}]

    res = await client.post("/api/campaigns", json=form())

    assert res.status_code == 201, res.text
    assert created(keitaro, "create_stream")[1]["offers"] == [{"offer_id": 7, "share": 100}]


def keitaro_422(body: str) -> KeitaroError:
    return KeitaroError(
        "keitaro_error",
        "Keitaro вернул ошибку",
        KeitaroDetails(status=422, method="POST", path="/campaigns", body=body),
    )


ALIAS_TAKEN = '{"alias":["Alias has already used"]}'


async def test_alias_taken_retries_with_new_alias(client, keitaro):
    keitaro.campaign_responses = [keitaro_422(ALIAS_TAKEN)]

    res = await client.post("/api/campaigns", json=form())

    assert res.status_code == 201, res.text
    first, second = created(keitaro, "create_campaign")
    assert first["alias"] != second["alias"]
    assert re.fullmatch(r"[a-z0-9]{8}", second["alias"])
    assert res.json()["alias"] == second["alias"]


async def test_alias_taken_three_times_is_alias_exhausted(client, keitaro, session):
    keitaro.campaign_responses = [keitaro_422(ALIAS_TAKEN)] * 3

    res = await client.post("/api/campaigns", json=form())

    assert res.status_code == 409
    assert res.json()["code"] == "alias_exhausted"
    assert len(created(keitaro, "create_campaign")) == 3
    assert created(keitaro, "create_stream") == []
    assert (await session.scalars(select(Campaign))).all() == []


async def test_other_campaign_error_is_not_retried(client, keitaro):
    keitaro.campaign_responses = [keitaro_422('{"name":["Name is required"]}')]

    res = await client.post("/api/campaigns", json=form())

    assert res.status_code == 502
    assert res.json()["code"] == "keitaro_error"
    assert len(created(keitaro, "create_campaign")) == 1


async def test_journal_not_written_when_stream_fails(client, keitaro, session):
    keitaro.stream_responses = [{"id": 555}, keitaro_422('{"offers":["bad"]}')]

    res = await client.post("/api/campaigns", json=form())

    assert res.status_code == 502
    assert (await session.scalars(select(Campaign))).all() == []
