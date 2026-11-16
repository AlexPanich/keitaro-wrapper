"""Создаватор: откат частично созданной кампании (#21)."""

import logging

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models import Campaign
from app.schemas.error import KeitaroDetails
from app.services.keitaro import KeitaroError

pytestmark = pytest.mark.anyio

CAMPAIGN_ID = 101  # первый id, который выдаёт FakeKeitaro


@pytest.fixture
def keitaro(keitaro):
    keitaro.offers = [{"id": 7, "name": "Offer 7"}]
    keitaro.groups = [{"id": 3, "name": "Тестовые"}]
    return keitaro


FORM = {"name": "wayfinder-test", "geo": "DE", "offer_id": 7, "group_id": 3}


def stream_error() -> KeitaroError:
    return KeitaroError(
        "keitaro_error",
        "Keitaro вернул ошибку",
        KeitaroDetails(status=422, method="POST", path="/streams", body='{"offers":["bad"]}'),
    )


def deleted(keitaro) -> list[object]:
    return [arg for name, arg in keitaro.calls if name == "delete_campaign"]


async def journal(session) -> list[Campaign]:
    return list((await session.scalars(select(Campaign))).all())


async def test_geo_stream_failure_deletes_campaign(client, keitaro, session):
    keitaro.stream_responses = [stream_error()]

    res = await client.post("/api/campaigns", json=FORM)

    assert res.status_code == 502
    body = res.json()
    assert body["code"] == "create_rolled_back"
    assert body["message"] == (
        "Кампания не создана: Keitaro отклонил шаг «создание гео-потока». Созданная кампания #101 удалена"
    )
    assert body["keitaro"]["path"] == "/streams"
    assert deleted(keitaro) == [CAMPAIGN_ID]
    assert await journal(session) == []


async def test_offer_stream_failure_deletes_campaign(client, keitaro, session):
    keitaro.stream_responses = [{"id": 555}, stream_error()]

    res = await client.post("/api/campaigns", json=FORM)

    body = res.json()
    assert body["code"] == "create_rolled_back"
    assert body["message"] == (
        "Кампания не создана: Keitaro отклонил шаг «создание оффер-потока». Созданная кампания #101 удалена"
    )
    assert deleted(keitaro) == [CAMPAIGN_ID]
    assert await journal(session) == []


async def test_journal_failure_deletes_campaign(client, keitaro, session):
    # Строка с тем же keitaro_id уже есть — INSERT нарушит unique и упадёт.
    session.add(
        Campaign(
            keitaro_id=CAMPAIGN_ID,
            name="старая",
            alias="oldalias",
            geo=["FR"],
            initial_offer_id=1,
            geo_stream_id=1,
            offer_stream_id=2,
        )
    )
    await session.commit()

    res = await client.post("/api/campaigns", json=FORM)

    assert res.status_code == 502
    body = res.json()
    assert body["code"] == "create_rolled_back"
    assert body["message"] == "Кампания не создана: не удался шаг «запись в журнал». Созданная кампания #101 удалена"
    assert body["keitaro"] is None
    assert deleted(keitaro) == [CAMPAIGN_ID]
    assert [row.name for row in await journal(session)] == ["старая"]


async def test_campaign_create_failure_needs_no_rollback(client, keitaro):
    # Кампании ещё нет — удалять нечего (сюда же попадают исчерпанные повторы alias).
    keitaro.campaign_responses = [stream_error()]

    res = await client.post("/api/campaigns", json=FORM)

    assert res.json()["code"] == "keitaro_error"
    assert deleted(keitaro) == []


async def test_failed_delete_is_orphaned(client, keitaro, session, caplog, monkeypatch):
    monkeypatch.setattr(settings, "keitaro_base_url", "https://k.example")
    keitaro.stream_responses = [{"id": 555}, stream_error()]
    keitaro.delete_error = KeitaroError(
        "keitaro_unavailable",
        "Keitaro не ответил",
        KeitaroDetails(status=None, method="DELETE", path=f"/campaigns/{CAMPAIGN_ID}", body=None),
    )

    with caplog.at_level(logging.ERROR):
        res = await client.post("/api/campaigns", json=FORM)

    assert res.status_code == 502
    body = res.json()
    assert body["code"] == "create_orphaned"
    assert body["message"] == "Кампания #101 создана частично и не удалена — удалите её в Keitaro вручную"
    assert body["keitaro_url"] == "https://k.example/admin/#!/campaigns/101"
    assert body["keitaro"]["path"] == "/streams"  # подробности упавшего шага, а не DELETE
    assert deleted(keitaro) == [CAMPAIGN_ID]
    assert await journal(session) == []
    assert any(r.levelno == logging.ERROR and "#101" in r.getMessage() for r in caplog.records)
