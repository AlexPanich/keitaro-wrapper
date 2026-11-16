"""Редактор: загрузка кампании и её потоков, `GET /api/editor/campaigns/{id}`."""

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models import KnownOffer

pytestmark = pytest.mark.anyio

CAMPAIGN_ID = 500


def stream(id: int, *, type: str = "regular", position: int = 1, schema: str = "landings",
           offers: list[tuple[int, int]] | None = None, state: str = "active", name: str | None = None) -> dict:
    """Поток в форме ответа `GET /campaigns/{id}/streams`; offers — пары (offer_id, share)."""
    return {
        "id": id,
        "campaign_id": CAMPAIGN_ID,
        "type": type,
        "name": name or f"Stream {id}",
        "position": position,
        "state": state,
        "schema": schema,
        "action_type": "http",
        "offers": [
            {"id": 9000 + offer_id, "stream_id": id, "offer_id": offer_id, "share": share, "state": "active"}
            for offer_id, share in (offers or [])
        ],
    }


@pytest.fixture(autouse=True)
def campaign(keitaro):
    keitaro.campaigns = {CAMPAIGN_ID: {"id": CAMPAIGN_ID, "name": "Main", "state": "active", "alias": "abc"}}
    keitaro.offers = [
        {"id": 1, "name": "Offer A", "state": "active"},
        {"id": 2, "name": "Offer B", "state": "disabled"},
        {"id": 3, "name": "Offer C", "state": "active"},
    ]


async def load(client):
    res = await client.get(f"/api/editor/campaigns/{CAMPAIGN_ID}")
    assert res.status_code == 200, res.text
    return res.json()


async def test_campaign_card_with_link_to_keitaro_admin(client, keitaro, monkeypatch):
    monkeypatch.setattr(settings, "keitaro_base_url", "https://tracker.example/")
    keitaro.streams[CAMPAIGN_ID] = []

    body = await load(client)

    assert body["campaign"] == {
        "id": CAMPAIGN_ID,
        "name": "Main",
        "state": "active",
        "keitaro_url": f"https://tracker.example/admin/#!/campaigns/{CAMPAIGN_ID}",
    }
    assert body["streams"] == []


async def test_streams_in_keitaro_check_order(client, keitaro):
    keitaro.streams[CAMPAIGN_ID] = [
        stream(10, type="default", position=1),
        stream(11, type="regular", position=2),
        stream(13, type="regular", position=1),
        stream(12, type="regular", position=1),
        stream(14, type="forced", position=5),
    ]

    body = await load(client)

    assert [s["id"] for s in body["streams"]] == [14, 12, 13, 11, 10]


async def test_only_landings_streams_are_offer_streams(client, keitaro):
    keitaro.streams[CAMPAIGN_ID] = [
        stream(10, position=1, schema="redirect"),
        stream(11, position=2, schema="landings", state="disabled"),
        stream(12, position=3, schema="landings"),
    ]

    body = await load(client)

    assert [(s["id"], s["is_offer_stream"]) for s in body["streams"]] == [(10, False), (11, True), (12, True)]
    disabled = body["streams"][1]
    assert disabled["state"] == "disabled"
    assert disabled["schema"] == "landings"
    assert (disabled["type"], disabled["position"]) == ("regular", 2)
    assert disabled["offers"] == []


async def test_offer_stream_shows_offers_with_shares_and_labels(client, keitaro):
    keitaro.streams[CAMPAIGN_ID] = [stream(12, offers=[(1, 30), (2, 30), (77, 10)])]

    [s] = (await load(client))["streams"]

    assert s["offers"] == [
        {"offer_id": 1, "name": "Offer A", "share": 30, "disabled": False, "deleted": False, "pinned": False},
        {"offer_id": 2, "name": "Offer B", "share": 30, "disabled": True, "deleted": False, "pinned": False},
        {"offer_id": 77, "name": None, "share": 10, "disabled": False, "deleted": True, "pinned": False},
    ]
    assert s["archive"] == []


async def test_offers_from_keitaro_become_known_and_published(client, keitaro, session):
    session.add(KnownOffer(stream_id=12, offer_id=1, campaign_id=CAMPAIGN_ID, pinned=True, published=False))
    await session.commit()
    keitaro.streams[CAMPAIGN_ID] = [stream(12, offers=[(1, 50), (3, 50)]), stream(13, schema="redirect", offers=[(2, 100)])]

    [s, _] = (await load(client))["streams"]

    assert [(o["offer_id"], o["pinned"]) for o in s["offers"]] == [(1, True), (3, False)]
    session.expire_all()
    rows = (await session.scalars(select(KnownOffer).order_by(KnownOffer.offer_id))).all()
    assert [(r.stream_id, r.offer_id, r.campaign_id, r.pinned, r.published) for r in rows] == [
        (12, 1, CAMPAIGN_ID, True, True),
        (12, 3, CAMPAIGN_ID, False, True),
    ]


async def test_offers_gone_from_keitaro_go_to_archive_unpinned(client, keitaro, session):
    session.add_all([
        KnownOffer(stream_id=12, offer_id=1, campaign_id=CAMPAIGN_ID, pinned=True, published=True),
        KnownOffer(stream_id=12, offer_id=3, campaign_id=CAMPAIGN_ID, pinned=True, published=True),
        KnownOffer(stream_id=12, offer_id=88, campaign_id=CAMPAIGN_ID, pinned=False, published=True),
    ])
    await session.commit()
    keitaro.streams[CAMPAIGN_ID] = [stream(12, offers=[(1, 100)])]

    [s] = (await load(client))["streams"]

    assert [o["offer_id"] for o in s["offers"]] == [1]
    assert s["archive"] == [
        {"offer_id": 3, "name": "Offer C", "share": None, "disabled": False, "deleted": False, "pinned": False},
        {"offer_id": 88, "name": None, "share": None, "disabled": False, "deleted": True, "pinned": False},
    ]
    session.expire_all()
    pinned = {r.offer_id: r.pinned for r in await session.scalars(select(KnownOffer))}
    assert pinned == {1: True, 3: False, 88: False}


async def test_known_offers_of_other_streams_are_not_archived_here(client, keitaro, session):
    session.add(KnownOffer(stream_id=99, offer_id=3, campaign_id=1, pinned=True, published=True))
    await session.commit()
    keitaro.streams[CAMPAIGN_ID] = [stream(12, offers=[(1, 100)])]

    [s] = (await load(client))["streams"]

    assert s["archive"] == []
    session.expire_all()
    assert (await session.get(KnownOffer, (99, 3))).pinned is True


async def test_deleted_campaign_is_not_found(client, keitaro, session):
    res = await client.get("/api/editor/campaigns/404404")

    assert res.status_code == 404
    body = res.json()
    assert body["code"] == "not_found"
    assert body["message"] == "Кампания #404404 удалена в Keitaro"


async def test_keitaro_failure_is_passed_through(client, keitaro):
    from app.schemas.error import KeitaroDetails
    from app.services.keitaro import KeitaroError

    async def boom(campaign_id):
        raise KeitaroError("keitaro_unavailable", "Keitaro не ответил",
                           KeitaroDetails(status=None, method="GET", path="/campaigns/500/streams", body=None))

    keitaro.list_streams = boom

    res = await client.get(f"/api/editor/campaigns/{CAMPAIGN_ID}")

    assert res.status_code == 504
    assert res.json()["code"] == "keitaro_unavailable"
