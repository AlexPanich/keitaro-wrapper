"""Редактор: ручная доля, закрепление и «Пересчитать» через API."""

import pytest

from tests.test_editor_draft import BASE, STREAM_ID, campaign, load, ok, rows, the_stream  # noqa: F401
from tests.test_editor_load import CAMPAIGN_ID, stream

pytestmark = pytest.mark.anyio


async def set_share(client, offer_id: int, share):
    return await client.put(f"{BASE}/offers/{offer_id}/share", json={"share": share})


async def pin(client, offer_id: int):
    return await client.post(f"{BASE}/offers/{offer_id}/pin")


async def unpin(client, offer_id: int):
    return await client.delete(f"{BASE}/offers/{offer_id}/pin")


def pins(body: dict) -> list[int]:
    return [o["offer_id"] for o in the_stream(body)["offers"] if o["pinned"]]


async def test_manual_share_pins_it_and_recomputes_the_rest(client):
    body = await ok(await set_share(client, 1, 50))

    assert rows(body) == [(1, 33, 50), (2, 33, 25), (3, 34, 25)]
    assert pins(body) == [1]
    assert the_stream(body)["draft"] is True


async def test_manual_share_over_100_of_pinned_is_refused_and_nothing_changes(client):
    await ok(await set_share(client, 1, 60))

    res = await set_share(client, 2, 50)

    assert res.status_code == 422
    assert res.json()["message"] == "Сумма закреплённых долей станет 110, больше 100"
    assert res.json()["fields"] == {}
    body = await load(client)
    assert rows(body) == [(1, 33, 60), (2, 33, 20), (3, 34, 20)]
    assert pins(body) == [1]


@pytest.mark.parametrize("share", [-1, 101, 12.5, "abc"])
async def test_manual_share_must_be_integer_0_to_100(client, share):
    res = await set_share(client, 1, share)

    assert res.status_code == 422
    assert "share" in res.json()["fields"]


async def test_zero_share_of_active_offer_is_allowed(client):
    body = await ok(await set_share(client, 3, 0))

    assert rows(body) == [(1, 33, 50), (2, 33, 50), (3, 34, 0)]
    assert the_stream(body)["archive"] == []


async def test_pin_keeps_current_share_without_recompute_or_draft(client):
    body = await ok(await pin(client, 1))

    assert rows(body) == [(1, 33, 33), (2, 33, 33), (3, 34, 34)]
    assert pins(body) == [1]
    assert the_stream(body)["draft"] is False
    assert pins(await load(client)) == [1]


async def test_pin_over_100_is_refused(client, keitaro):
    keitaro.streams[CAMPAIGN_ID] = [stream(STREAM_ID, offers=[(1, 60), (2, 50)])]
    await ok(await pin(client, 1))

    res = await pin(client, 2)

    assert res.status_code == 422
    assert res.json()["message"] == "Сумма закреплённых долей станет 110, больше 100"
    assert pins(await load(client)) == [1]


async def test_pin_of_archived_offer_is_refused(client):
    await ok(await client.delete(f"{BASE}/offers/1"))

    res = await pin(client, 1)

    assert res.status_code == 422
    assert res.json()["message"] == "Оффера #1 нет в потоке"


async def test_unpin_returns_offer_to_pool_and_recomputes(client, keitaro):
    keitaro.streams[CAMPAIGN_ID] = [stream(STREAM_ID, offers=[(1, 25), (2, 38), (3, 37)])]
    await ok(await pin(client, 1))

    body = await ok(await unpin(client, 1))

    assert rows(body) == [(1, 25, 33), (2, 38, 33), (3, 37, 34)]
    assert pins(body) == []
    assert the_stream(body)["draft"] is True


async def test_recompute_makes_draft_with_sum_100_keeping_pinned(client, keitaro):
    keitaro.streams[CAMPAIGN_ID] = [stream(STREAM_ID, offers=[(1, 50), (2, 30), (3, 30)])]
    await ok(await pin(client, 2))

    body = await ok(await client.post(f"{BASE}/recompute"))

    assert rows(body) == [(1, 50, 35), (2, 30, 30), (3, 30, 35)]
    assert the_stream(body)["draft"] is True


async def test_recompute_of_stream_already_at_100_leaves_no_draft(client):
    body = await ok(await client.post(f"{BASE}/recompute"))

    assert rows(body) == [(1, 33, 33), (2, 33, 33), (3, 34, 34)]
    assert the_stream(body)["draft"] is False


async def test_remove_pinned_then_cancel_returns_offer_unpinned(client):
    await ok(await pin(client, 3))
    await ok(await client.delete(f"{BASE}/offers/3"))

    body = await ok(await client.delete(f"{BASE}/draft"))

    assert rows(body) == [(1, 33, 33), (2, 33, 33), (3, 34, 34)]
    assert pins(body) == []


async def test_pin_resets_when_offer_goes_to_archive_on_load(client, keitaro):
    await ok(await pin(client, 3))
    keitaro.streams[CAMPAIGN_ID] = [stream(STREAM_ID, offers=[(1, 50), (2, 50)])]

    body = await load(client)

    assert [(o["offer_id"], o["pinned"]) for o in the_stream(body)["archive"]] == [(3, False)]
