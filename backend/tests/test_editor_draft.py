"""Редактор: черновик оффер-потока — Add, Remove, Bring back, Cancel через API."""

import pytest

from app.models import KnownOffer
from tests.test_editor_load import CAMPAIGN_ID, stream

pytestmark = pytest.mark.anyio

STREAM_ID = 12
BASE = f"/api/editor/campaigns/{CAMPAIGN_ID}/streams/{STREAM_ID}"


@pytest.fixture(autouse=True)
def campaign(keitaro):
    keitaro.campaigns = {CAMPAIGN_ID: {"id": CAMPAIGN_ID, "name": "Main", "state": "active", "alias": "abc"}}
    keitaro.offers = [{"id": i, "name": f"Offer {i}", "state": "active"} for i in range(1, 10)]
    keitaro.streams[CAMPAIGN_ID] = [stream(STREAM_ID, offers=[(1, 33), (2, 33), (3, 34)])]


def the_stream(body: dict) -> dict:
    return next(s for s in body["streams"] if s["id"] == STREAM_ID)


def rows(body: dict) -> list[tuple]:
    """Активные офферы: (offer_id, в Keitaro, станет)."""
    return [(o["offer_id"], o["share"], o["new_share"]) for o in the_stream(body)["offers"]]


def archive(body: dict) -> list[tuple]:
    return [(o["offer_id"], o["share"], o["new_share"]) for o in the_stream(body)["archive"]]


async def ok(res) -> dict:
    assert res.status_code == 200, res.text
    return res.json()


async def add(client, offer_id: int):
    return await client.post(f"{BASE}/offers", json={"offer_id": offer_id})


async def remove(client, offer_id: int):
    return await client.delete(f"{BASE}/offers/{offer_id}")


async def bring_back(client, offer_id: int):
    return await client.post(f"{BASE}/offers/{offer_id}/bring-back")


async def load(client) -> dict:
    return await ok(await client.get(f"/api/editor/campaigns/{CAMPAIGN_ID}"))


async def test_no_draft_new_share_equals_keitaro(client):
    s = the_stream(await load(client))

    assert s["draft"] is False
    assert [(o["offer_id"], o["share"], o["new_share"], o["published"]) for o in s["offers"]] == [
        (1, 33, 33, True), (2, 33, 33, True), (3, 34, 34, True),
    ]


async def test_add_new_offer_recomputes_and_creates_draft(client):
    body = await ok(await add(client, 4))

    s = the_stream(body)
    assert s["draft"] is True
    assert rows(body) == [(1, 33, 25), (2, 33, 25), (3, 34, 25), (4, None, 25)]
    assert s["offers"][3]["published"] is False
    assert s["offers"][3]["name"] == "Offer 4"

    body = await ok(await add(client, 5))
    assert rows(body) == [(1, 33, 20), (2, 33, 20), (3, 34, 20), (4, None, 20), (5, None, 20)]


async def test_draft_survives_reload_and_keeps_base_snapshot(client, session_factory):
    await ok(await add(client, 4))

    assert rows(await load(client)) == [(1, 33, 25), (2, 33, 25), (3, 34, 25), (4, None, 25)]
    from app.models import StreamDraft

    async with session_factory() as s:
        draft = await s.get(StreamDraft, STREAM_ID)
        assert draft.campaign_id == CAMPAIGN_ID
        assert draft.base_offers == [
            {"offer_id": 1, "share": 33}, {"offer_id": 2, "share": 33}, {"offer_id": 3, "share": 34},
        ]
        assert draft.offers == [
            {"offer_id": 1, "share": 25}, {"offer_id": 2, "share": 25},
            {"offer_id": 3, "share": 25}, {"offer_id": 4, "share": 25},
        ]
        known = await s.get(KnownOffer, (STREAM_ID, 4))
        assert (known.published, known.pinned, known.campaign_id) == (False, False, CAMPAIGN_ID)


async def test_add_offer_missing_in_keitaro_is_field_error(client):
    res = await add(client, 404)

    assert res.status_code == 422
    body = res.json()
    assert body["code"] == "validation_error"
    assert body["fields"] == {"offer_id": "Оффер #404 не найден в Keitaro"}
    assert the_stream(await load(client))["draft"] is False


async def test_add_active_offer_is_refused(client):
    res = await add(client, 2)

    assert res.status_code == 422
    assert res.json()["message"] == "Оффер #2 уже в потоке"
    assert res.json()["fields"] == {}


async def test_first_offer_in_empty_stream_gets_100(client, keitaro):
    keitaro.streams[CAMPAIGN_ID] = [stream(STREAM_ID, offers=[])]

    body = await ok(await add(client, 7))

    assert rows(body) == [(7, None, 100)]


async def test_remove_sends_offer_to_archive_with_zero(client, keitaro):
    keitaro.streams[CAMPAIGN_ID] = [stream(STREAM_ID, offers=[(1, 25), (2, 25), (3, 25), (4, 25)])]

    body = await ok(await remove(client, 1))

    assert rows(body) == [(2, 25, 33), (3, 25, 33), (4, 25, 34)]
    # Убранный оффер в архиве: в Keitaro у него ещё 25, в черновике — ничего.
    assert archive(body) == [(1, 25, None)]
    assert the_stream(body)["draft"] is True


async def test_remove_last_active_offer_is_refused(client, keitaro):
    keitaro.streams[CAMPAIGN_ID] = [stream(STREAM_ID, offers=[(1, 100)])]

    res = await remove(client, 1)

    assert res.status_code == 422
    assert res.json()["message"] == "Нельзя убрать последний оффер потока"


async def test_remove_pinned_offer_unpins_it(client, session):
    session.add(KnownOffer(stream_id=STREAM_ID, offer_id=3, campaign_id=CAMPAIGN_ID, pinned=True, published=True))
    await session.commit()

    body = await ok(await remove(client, 3))

    assert rows(body) == [(1, 33, 50), (2, 33, 50)]
    assert the_stream(body)["archive"][0]["pinned"] is False


async def test_bring_back_goes_to_the_end_with_pinned_kept(client, keitaro, session):
    keitaro.streams[CAMPAIGN_ID] = [stream(STREAM_ID, offers=[(1, 25), (2, 25)])]
    session.add_all([
        KnownOffer(stream_id=STREAM_ID, offer_id=1, campaign_id=CAMPAIGN_ID, pinned=True, published=True),
        KnownOffer(stream_id=STREAM_ID, offer_id=5, campaign_id=CAMPAIGN_ID, pinned=False, published=True),
    ])
    await session.commit()

    body = await ok(await bring_back(client, 5))

    assert rows(body) == [(1, 25, 25), (2, 25, 37), (5, None, 38)]
    assert archive(body) == []


async def test_add_of_archived_offer_works_as_bring_back(client, session):
    session.add(KnownOffer(stream_id=STREAM_ID, offer_id=5, campaign_id=CAMPAIGN_ID, pinned=False, published=True))
    await session.commit()

    body = await ok(await add(client, 5))

    assert rows(body) == [(1, 33, 25), (2, 33, 25), (3, 34, 25), (5, None, 25)]
    assert the_stream(body)["offers"][3]["published"] is True


async def test_bring_back_of_offer_deleted_in_keitaro_is_refused(client, session):
    session.add(KnownOffer(stream_id=STREAM_ID, offer_id=77, campaign_id=CAMPAIGN_ID, pinned=False, published=True))
    await session.commit()

    res = await bring_back(client, 77)

    assert res.status_code == 422
    assert res.json()["message"] == "Оффер #77 удалён в Keitaro, вернуть нельзя"


async def test_bring_back_of_not_archived_offer_is_refused(client):
    res = await bring_back(client, 1)

    assert res.status_code == 422
    assert res.json()["message"] == "Оффер #1 не в архиве потока"


async def test_draft_disappears_when_it_matches_keitaro_again(client, session_factory):
    await ok(await add(client, 4))

    body = await ok(await remove(client, 4))

    assert the_stream(body)["draft"] is False
    assert rows(body) == [(1, 33, 33), (2, 33, 33), (3, 34, 34)]
    # Неопубликованный оффер пропадает вместе с черновиком, как при «Отменить».
    assert archive(body) == []
    from app.models import StreamDraft

    async with session_factory() as s:
        assert await s.get(StreamDraft, STREAM_ID) is None
        assert await s.get(KnownOffer, (STREAM_ID, 4)) is None


async def test_draft_matching_keitaro_in_other_order_also_disappears(client, keitaro):
    keitaro.streams[CAMPAIGN_ID] = [stream(STREAM_ID, offers=[(1, 25), (2, 25), (3, 25), (4, 25)])]
    await ok(await remove(client, 1))

    body = await ok(await bring_back(client, 1))

    assert the_stream(body)["draft"] is False
    assert rows(body) == [(1, 25, 25), (2, 25, 25), (3, 25, 25), (4, 25, 25)]


async def test_cancel_drops_draft_and_unpublished_offers(client, session_factory):
    await ok(await add(client, 4))
    await ok(await remove(client, 1))

    body = await ok(await client.delete(f"{BASE}/draft"))

    s = the_stream(body)
    assert s["draft"] is False
    assert rows(body) == [(1, 33, 33), (2, 33, 33), (3, 34, 34)]
    assert s["archive"] == []
    async with session_factory() as ses:
        assert await ses.get(KnownOffer, (STREAM_ID, 4)) is None
        assert await ses.get(KnownOffer, (STREAM_ID, 1)) is not None


async def test_drafts_of_streams_are_independent(client, keitaro):
    keitaro.streams[CAMPAIGN_ID] = [
        stream(STREAM_ID, offers=[(1, 50), (2, 50)]),
        stream(13, position=2, offers=[(3, 100)]),
    ]
    await ok(await add(client, 4))
    await ok(await client.post(f"/api/editor/campaigns/{CAMPAIGN_ID}/streams/13/offers", json={"offer_id": 5}))

    body = await ok(await client.delete(f"{BASE}/draft"))

    other = next(s for s in body["streams"] if s["id"] == 13)
    assert the_stream(body)["draft"] is False
    assert other["draft"] is True
    assert [(o["offer_id"], o["new_share"]) for o in other["offers"]] == [(3, 50), (5, 50)]


async def test_reload_keeps_pin_of_offer_that_is_only_in_draft(client, session):
    await ok(await add(client, 4))
    row = await session.get(KnownOffer, (STREAM_ID, 4))
    row.pinned = True
    await session.commit()

    s = the_stream(await load(client))

    assert s["offers"][3]["pinned"] is True


async def test_unknown_stream_is_not_found(client):
    res = await client.post(f"/api/editor/campaigns/{CAMPAIGN_ID}/streams/999/offers", json={"offer_id": 4})

    assert res.status_code == 404
    assert res.json()["message"] == "Оффер-поток #999 не найден в кампании"


async def test_redirect_stream_is_not_editable(client, keitaro):
    keitaro.streams[CAMPAIGN_ID].append(stream(13, schema="redirect"))

    res = await client.post(f"/api/editor/campaigns/{CAMPAIGN_ID}/streams/13/offers", json={"offer_id": 4})

    assert res.status_code == 404
