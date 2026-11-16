"""Редактор офферов: поиск кампании Keitaro и загрузка её потоков со сверкой известных офферов."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ApiError
from app.models import KnownOffer
from app.schemas.editor import CampaignShort, EditorCampaign, EditorOffer, EditorStream, EditorView
from app.services.keitaro import KeitaroClient, KeitaroError

# Порядок проверки потоков в Keitaro: перехватывающие, обычные, по умолчанию.
_TYPE_RANK = {"forced": 0, "regular": 1, "default": 2}


def _matches(item: dict, q: str) -> bool:
    """Подстрока названия без учёта регистра или точное совпадение ID."""
    return q.casefold() in str(item.get("name", "")).casefold() or q == str(item["id"])


async def search_campaigns(keitaro: KeitaroClient, q: str) -> list[CampaignShort]:
    # Поиска по имени в Keitaro нет — тянем весь список и фильтруем у себя.
    q = q.strip()
    return [
        CampaignShort(id=c["id"], name=c["name"], state=c["state"])
        for c in await keitaro.list_campaigns()
        if not q or _matches(c, q)
    ]


def keitaro_campaign_url(campaign_id: int) -> str:
    """Ссылка на кампанию в админке Keitaro."""
    return f"{settings.keitaro_base_url.rstrip('/')}/admin/#!/campaigns/{campaign_id}"


def _check_order(stream: dict) -> tuple[int, int, int]:
    # При одинаковой позиции Keitaro проверяет потоки по id.
    return (_TYPE_RANK.get(stream.get("type"), 1), stream.get("position") or 0, stream["id"])


def _is_offer_stream(stream: dict) -> bool:
    # Оффер-поток — любой поток со schema: landings, даже пустой; тип и состояние не важны.
    return stream.get("schema") == "landings"


async def _get_campaign(keitaro: KeitaroClient, campaign_id: int) -> dict:
    try:
        return await keitaro.get_campaign(campaign_id)
    except KeitaroError as err:
        # Удалённая (архивная) кампания отвечает 404, хотя её потоки ещё читаются,
        # поэтому кампанию проверяем первой.
        if err.status == 404:
            raise ApiError("not_found", f"Кампания #{campaign_id} удалена в Keitaro", keitaro=err.keitaro) from None
        raise


async def _sync_known_offers(
    session: AsyncSession, campaign_id: int, streams: list[dict]
) -> dict[tuple[int, int], KnownOffer]:
    """Сверяет известные офферы оффер-потоков с Keitaro; возвращает их по (stream_id, offer_id).

    Каждый оффер из Keitaro становится известным и опубликованным; известные, но пропавшие
    из Keitaro, уходят в архив — закрепление у них снимается.
    """
    stream_ids = [s["id"] for s in streams]
    known = {
        (k.stream_id, k.offer_id): k
        for k in await session.scalars(select(KnownOffer).where(KnownOffer.stream_id.in_(stream_ids)))
    }
    in_keitaro = {(s["id"], o["offer_id"]) for s in streams for o in s.get("offers") or []}
    for key in in_keitaro:
        if key in known:
            known[key].published = True
        else:
            known[key] = KnownOffer(
                stream_id=key[0], offer_id=key[1], campaign_id=campaign_id, pinned=False, published=True
            )
            session.add(known[key])
    for key, row in known.items():
        if key not in in_keitaro:
            row.pinned = False
    await session.commit()
    return known


def _offer_row(
    offer_id: int,
    share: int | None,
    catalog: dict[int, dict],
    known: KnownOffer | None,
    link_state: str | None = None,
) -> EditorOffer:
    item = catalog.get(offer_id)
    return EditorOffer(
        offer_id=offer_id,
        name=item["name"] if item else None,
        share=share,
        disabled=link_state == "disabled" or bool(item and item.get("state") == "disabled"),
        deleted=item is None,
        pinned=bool(known and known.pinned),
    )


def _stream_view(stream: dict, catalog: dict[int, dict], known: dict[tuple[int, int], KnownOffer]) -> EditorStream:
    offers: list[EditorOffer] = []
    archive: list[EditorOffer] = []
    is_offer_stream = _is_offer_stream(stream)
    if is_offer_stream:
        links = stream.get("offers") or []
        offers = [
            _offer_row(o["offer_id"], o["share"], catalog, known.get((stream["id"], o["offer_id"])), o.get("state"))
            for o in links
        ]
        active = {o["offer_id"] for o in links}
        # Архивный оффер — известный потоку, но не активный; порядок не хранится, сортируем по id.
        archive = [
            _offer_row(offer_id, None, catalog, row)
            for (stream_id, offer_id), row in sorted(known.items())
            if stream_id == stream["id"] and offer_id not in active
        ]
    return EditorStream(
        id=stream["id"],
        name=stream.get("name") or "",
        type=stream.get("type") or "regular",
        position=stream.get("position"),
        state=stream.get("state") or "active",
        stream_schema=stream.get("schema") or "",
        is_offer_stream=is_offer_stream,
        offers=offers,
        archive=archive,
    )


async def load_campaign(session: AsyncSession, keitaro: KeitaroClient, campaign_id: int) -> EditorView:
    """Читает кампанию и её потоки из Keitaro и сверяет с ними известные офферы.

    Fetch в интерфейсе вызывает эту же загрузку.
    """
    campaign = await _get_campaign(keitaro, campaign_id)
    streams = sorted(await keitaro.list_streams(campaign_id), key=_check_order)
    catalog = {o["id"]: o for o in await keitaro.list_offers()}
    known = await _sync_known_offers(session, campaign_id, [s for s in streams if _is_offer_stream(s)])
    return EditorView(
        campaign=EditorCampaign(
            id=campaign["id"],
            name=campaign["name"],
            state=campaign["state"],
            keitaro_url=keitaro_campaign_url(campaign["id"]),
        ),
        streams=[_stream_view(s, catalog, known) for s in streams],
    )
