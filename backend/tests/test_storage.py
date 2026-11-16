"""Хранилище: журнал кампаний, известные офферы и черновики (на SQLite в памяти)."""

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Campaign, StreamDraft, KnownOffer

pytestmark = pytest.mark.anyio


async def test_list_campaigns_returns_geo_as_list(client, session):
    session.add(
        Campaign(
            keitaro_id=101,
            name="Test",
            alias="abc123",
            geo=["RU", "KZ"],
            initial_offer_id=7,
            geo_stream_id=11,
            offer_stream_id=12,
        )
    )
    await session.commit()

    res = await client.get("/api/campaigns")

    assert res.status_code == 200
    [campaign] = res.json()
    assert campaign["keitaro_id"] == 101
    assert campaign["geo"] == ["RU", "KZ"]
    assert campaign["geo_stream_id"] == 11
    assert campaign["offer_stream_id"] == 12


async def test_known_offer_is_unique_per_stream(session):
    session.add(KnownOffer(stream_id=12, offer_id=7, campaign_id=101, pinned=False, published=True))
    session.add(KnownOffer(stream_id=13, offer_id=7, campaign_id=101, pinned=False, published=True))
    await session.commit()

    session.add(KnownOffer(stream_id=12, offer_id=7, campaign_id=101, pinned=True, published=False))
    with pytest.raises(IntegrityError):
        await session.commit()


async def test_draft_keeps_offer_order(session_factory):
    offers = [{"offer_id": 9, "share": 30}, {"offer_id": 3, "share": 70}]
    base = [{"offer_id": 3, "share": 100}]
    async with session_factory() as s:
        s.add(StreamDraft(stream_id=12, campaign_id=101, offers=offers, base_offers=base))
        await s.commit()

    async with session_factory() as s:
        draft = await s.get(StreamDraft, 12)

    assert draft.offers == offers
    assert draft.base_offers == base
    assert draft.updated_at is not None
