"""Редактор: публикация черновика потока в Keitaro и сверка черновиков при загрузке."""

import pytest
from sqlalchemy import select

from app.models import KnownOffer, StreamDraft
from app.schemas.error import KeitaroDetails
from app.services.keitaro import KeitaroError
from tests.test_editor_draft import BASE, STREAM_ID, add, archive, load, ok, remove, rows, the_stream
from tests.test_editor_load import CAMPAIGN_ID, stream

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def campaign(keitaro):
    keitaro.campaigns = {CAMPAIGN_ID: {"id": CAMPAIGN_ID, "name": "Main", "state": "active", "alias": "abc"}}
    keitaro.offers = [{"id": i, "name": f"Offer {i}", "state": "active"} for i in range(1, 10)]
    keitaro.streams[CAMPAIGN_ID] = [stream(STREAM_ID, offers=[(1, 33), (2, 33), (3, 34)], name="Offers")]


async def publish(client, overwrite: bool = False):
    return await client.post(f"{BASE}/publish", json={"overwrite": overwrite})


def puts(keitaro) -> list[tuple]:
    return [c for c in keitaro.calls if c[0] == "update_stream"]


async def test_publish_puts_draft_rereads_and_drops_draft(client, keitaro, session_factory):
    await ok(await add(client, 4))
    await ok(await remove(client, 1))
    keitaro.calls.clear()

    body = await ok(await publish(client))

    assert puts(keitaro) == [
        ("update_stream", (STREAM_ID, {"offers": [
            {"offer_id": 2, "share": 33}, {"offer_id": 3, "share": 33}, {"offer_id": 4, "share": 34},
        ]})),
    ]
    # После PUT поток перечитан из Keitaro.
    after_put = keitaro.calls[keitaro.calls.index(puts(keitaro)[0]) + 1:]
    assert ("list_streams", CAMPAIGN_ID) in after_put
    assert body["warning"] is None
    assert the_stream(body["view"])["draft"] is False
    assert rows(body["view"]) == [(2, 33, 33), (3, 33, 33), (4, 34, 34)]
    assert archive(body["view"]) == [(1, None, None)]
    async with session_factory() as s:
        assert await s.get(StreamDraft, STREAM_ID) is None
        known = {k.offer_id: k.published for k in await s.scalars(select(KnownOffer))}
    assert known == {1: True, 2: True, 3: True, 4: True}
    # Публикация пережила перезагрузку: черновика нет, состав — из Keitaro.
    assert rows(await load(client)) == [(2, 33, 33), (3, 33, 33), (4, 34, 34)]


def change_in_keitaro(keitaro, offers: list[tuple[int, int]]) -> None:
    """Кто-то поменял поток в админке Keitaro после начала правок."""
    keitaro.streams[CAMPAIGN_ID] = [stream(STREAM_ID, offers=offers, name="Offers")]


async def test_publish_refuses_when_keitaro_changed_under_draft(client, keitaro, session_factory):
    await ok(await add(client, 4))
    change_in_keitaro(keitaro, [(1, 50), (2, 50)])

    res = await publish(client)

    assert res.status_code == 409
    assert res.json()["code"] == "draft_conflict"
    assert res.json()["message"] == "Поток в Keitaro изменился после начала правок"
    assert puts(keitaro) == []
    async with session_factory() as s:
        assert await s.get(StreamDraft, STREAM_ID) is not None


async def test_publish_with_overwrite_puts_draft_over_changed_stream(client, keitaro):
    await ok(await add(client, 4))
    change_in_keitaro(keitaro, [(1, 50), (2, 50)])

    body = await ok(await publish(client, overwrite=True))

    assert puts(keitaro) == [("update_stream", (STREAM_ID, {"offers": [
        {"offer_id": 1, "share": 25}, {"offer_id": 2, "share": 25},
        {"offer_id": 3, "share": 25}, {"offer_id": 4, "share": 25},
    ]}))]
    assert rows(body["view"]) == [(1, 25, 25), (2, 25, 25), (3, 25, 25), (4, 25, 25)]


async def test_load_flags_stream_changed_under_draft(client, keitaro):
    await ok(await add(client, 4))
    assert the_stream(await load(client))["conflict"] is False

    change_in_keitaro(keitaro, [(1, 50), (2, 50)])

    s = the_stream(await load(client))
    assert s["draft"] is True
    assert s["conflict"] is True


@pytest.mark.parametrize(
    "gone",
    [
        [],
        [stream(STREAM_ID, schema="redirect", name="Offers")],
    ],
    ids=["deleted", "not-landings"],
)
async def test_vanished_stream_drops_draft_with_campaign_notice(client, keitaro, session_factory, gone):
    await ok(await add(client, 4))
    keitaro.streams[CAMPAIGN_ID] = gone

    body = await load(client)

    assert body["notices"] == ["Поток «Offers» удалён в Keitaro, неопубликованные правки потеряны"]
    async with session_factory() as s:
        assert await s.get(StreamDraft, STREAM_ID) is None
        assert sorted(k.offer_id for k in await s.scalars(select(KnownOffer))) == [1, 2, 3, 4]
    # Сообщение одноразовое: черновика больше нет.
    assert (await load(client))["notices"] == []


async def test_deleted_campaign_keeps_drafts(client, keitaro, session_factory):
    await ok(await add(client, 4))
    keitaro.campaigns = {}

    res = await client.get(f"/api/editor/campaigns/{CAMPAIGN_ID}")

    assert res.status_code == 404
    async with session_factory() as s:
        assert await s.get(StreamDraft, STREAM_ID) is not None


BASE_OFFERS = [{"offer_id": 1, "share": 33}, {"offer_id": 2, "share": 33}, {"offer_id": 3, "share": 34}]


@pytest.mark.parametrize(
    ("offers", "message"),
    [
        ([{"offer_id": 1, "share": 50}, {"offer_id": 2, "share": 40}], "Сумма долей — 90%, а должна быть 100%"),
        ([{"offer_id": 1, "share": 150}, {"offer_id": 2, "share": -50}], "Доля — целое от 0 до 100"),
        ([{"offer_id": 1, "share": 50.5}, {"offer_id": 2, "share": 49.5}], "Доля — целое от 0 до 100"),
        ([], "В потоке должен остаться хотя бы один оффер"),
        ([{"offer_id": 1, "share": 50}, {"offer_id": 77, "share": 50}], "Оффер #77 не найден в Keitaro"),
    ],
)
async def test_invalid_draft_is_not_published(client, keitaro, session, offers, message):
    session.add(StreamDraft(stream_id=STREAM_ID, campaign_id=CAMPAIGN_ID, offers=offers, base_offers=BASE_OFFERS))
    await session.commit()

    res = await publish(client)

    assert res.status_code == 422, res.text
    assert res.json()["code"] == "validation_error"
    assert res.json()["message"] == message
    assert puts(keitaro) == []


def keitaro_down(method: str = "PUT") -> KeitaroError:
    return KeitaroError(
        "keitaro_unavailable",
        "Keitaro не ответил",
        KeitaroDetails(status=None, method=method, path=f"/streams/{STREAM_ID}", body=None),
    )


async def test_failed_put_keeps_draft(client, keitaro, session_factory):
    await ok(await add(client, 4))
    keitaro.update_responses = [keitaro_down()]

    res = await publish(client)

    assert res.status_code == 504
    assert res.json()["code"] == "keitaro_unavailable"
    async with session_factory() as s:
        assert await s.get(StreamDraft, STREAM_ID) is not None
        assert (await s.get(KnownOffer, (STREAM_ID, 4))).published is False
    assert rows(await load(client)) == [(1, 33, 25), (2, 33, 25), (3, 34, 25), (4, None, 25)]


async def test_put_ok_but_reread_failed_is_success_with_warning(client, keitaro, session_factory):
    await ok(await add(client, 4))
    # Первое чтение потоков — перед публикацией, второе (повторное) падает.
    keitaro.list_streams_responses = [None, keitaro_down("GET")]

    body = await ok(await publish(client))

    assert body["warning"] == "Опубликовано, но не удалось перечитать поток — нажмите Fetch"
    assert the_stream(body["view"])["draft"] is False
    assert rows(body["view"]) == [(1, 25, 25), (2, 25, 25), (3, 25, 25), (4, 25, 25)]
    async with session_factory() as s:
        assert await s.get(StreamDraft, STREAM_ID) is None


async def test_reread_differs_from_sent_shows_keitaro_data_with_warning(client, keitaro, session_factory):
    await ok(await add(client, 4))
    keitaro.update_responses = [[{"offer_id": 1, "share": 50}, {"offer_id": 4, "share": 50}]]

    body = await ok(await publish(client))

    assert body["warning"] == "Keitaro сохранил поток не так, как отправлено"
    assert the_stream(body["view"])["draft"] is False
    assert rows(body["view"]) == [(1, 50, 50), (4, 50, 50)]
    async with session_factory() as s:
        assert await s.get(StreamDraft, STREAM_ID) is None
