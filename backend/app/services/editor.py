"""Редактор офферов кампании Keitaro.

- Поиск кампании и загрузка её потоков в порядке проверки со сверкой известных офферов
  (`stream_offers`) и черновиков (`stream_drafts`) с Keitaro.
- Черновик оффер-потока: Add, Remove, Bring back, ручная доля (доля закрепляется, остальные
  делят остаток), снятие закрепления, «Пересчитать», Cancel. Каждое действие отвечает полным
  `EditorView`; черновик хранит снимок Keitaro `base_offers` для обнаружения конфликта.
- Закрепление (булавка) пишется в `stream_offers.pinned` сразу и черновик не создаёт;
  Σ закреплённых > 100 — мгновенный отказ.
- Публикация: проверка черновика → сверка с `base_offers` (`draft_conflict` без `overwrite`) →
  `PUT /streams/{id}` → удаление черновика → повторное чтение (расхождение — предупреждение).
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TypedDict

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import VALIDATION_MESSAGE, ApiError
from app.models import KnownOffer, StreamDraft
from app.schemas.editor import (
    CampaignShort,
    EditorCampaign,
    EditorOffer,
    EditorStream,
    EditorView,
    PublishResult,
)
from app.services.dictionaries import matches
from app.services.keitaro import KeitaroClient, KeitaroError
from app.services.shares import recompute

class DraftOffer(TypedDict):
    """Оффер в составе потока: как в `stream_drafts.offers` и теле `PUT /streams/{id}`."""

    offer_id: int
    share: int


# Порядок проверки потоков в Keitaro: перехватывающие, обычные, по умолчанию.
_TYPE_RANK = {"forced": 0, "regular": 1, "default": 2}


async def search_campaigns(keitaro: KeitaroClient, q: str) -> list[CampaignShort]:
    # Поиска по имени в Keitaro нет — тянем весь список и фильтруем у себя, как офферы.
    q = q.strip()
    return [
        CampaignShort(id=c["id"], name=c["name"], state=c["state"])
        for c in await keitaro.list_campaigns()
        if not q or matches(c, q)
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


def _links(stream: dict) -> list[DraftOffer]:
    """Офферы потока в Keitaro в форме черновика: `[{offer_id, share}]` по порядку."""
    return [DraftOffer(offer_id=o["offer_id"], share=o["share"]) for o in stream.get("offers") or []]


def _same_shares(a: list[DraftOffer], b: list[DraftOffer]) -> bool:
    # «Совпало с Keitaro» — тот же состав с теми же долями; порядок не важен.
    return {o["offer_id"]: o["share"] for o in a} == {o["offer_id"]: o["share"] for o in b}


def _is_conflict(draft: StreamDraft, stream: dict) -> bool:
    # Поток в Keitaro изменился после создания черновика: сравниваем со снимком `base_offers`.
    return not _same_shares(draft.base_offers, _links(stream))


async def _get_campaign(keitaro: KeitaroClient, campaign_id: int) -> dict:
    try:
        return await keitaro.get_campaign(campaign_id)
    except KeitaroError as err:
        # Удалённая (архивная) кампания отвечает 404, хотя её потоки ещё читаются,
        # поэтому кампанию проверяем первой.
        if err.status == 404:
            raise ApiError("not_found", f"Кампания #{campaign_id} удалена в Keitaro", keitaro=err.keitaro) from None
        raise


async def _list_streams(keitaro: KeitaroClient, campaign_id: int) -> list[dict]:
    """Потоки кампании в порядке проверки Keitaro."""
    return sorted(await keitaro.list_streams(campaign_id), key=_check_order)


async def _read_keitaro(keitaro: KeitaroClient, campaign_id: int) -> tuple[dict, list[dict], dict[int, dict]]:
    """Кампания, её потоки в порядке проверки и справочник офферов по id."""
    campaign = await _get_campaign(keitaro, campaign_id)
    streams = await _list_streams(keitaro, campaign_id)
    catalog = {o["id"]: o for o in await keitaro.list_offers()}
    return campaign, streams, catalog


async def _sync_known_offers(
    session: AsyncSession, campaign_id: int, streams: list[dict], drafts: dict[int, StreamDraft]
) -> dict[tuple[int, int], KnownOffer]:
    """Сверяет известные офферы оффер-потоков с Keitaro; возвращает их по (stream_id, offer_id).

    Каждый оффер из Keitaro становится известным и опубликованным. Известные, но пропавшие
    из Keitaro, уходят в архив — закрепление у них снимается, если оффер не активен в черновике.
    """
    stream_ids = [s["id"] for s in streams]
    known = {
        (k.stream_id, k.offer_id): k
        for k in await session.scalars(select(KnownOffer).where(KnownOffer.stream_id.in_(stream_ids)))
    }
    in_keitaro = {(s["id"], o["offer_id"]) for s in streams for o in _links(s)}
    in_drafts = {(stream_id, o["offer_id"]) for stream_id, d in drafts.items() for o in d.offers}
    for key in in_keitaro:
        if key in known:
            known[key].published = True
        else:
            known[key] = KnownOffer(
                stream_id=key[0], offer_id=key[1], campaign_id=campaign_id, pinned=False, published=True
            )
            session.add(known[key])
    for key, row in known.items():
        if key not in in_keitaro and key not in in_drafts:
            row.pinned = False
    return known


async def _drop_draft(session: AsyncSession, stream_id: int) -> None:
    """Удаляет черновик потока и добавленные в нём, но ни разу не опубликованные офферы."""
    await session.execute(delete(StreamDraft).where(StreamDraft.stream_id == stream_id))
    await session.execute(
        delete(KnownOffer).where(KnownOffer.stream_id == stream_id, KnownOffer.published.is_(False))
    )


def _offer_row(
    offer_id: int,
    share: int | None,
    new_share: int | None,
    catalog: dict[int, dict],
    known: KnownOffer | None,
    link_state: str | None = None,
) -> EditorOffer:
    item = catalog.get(offer_id)
    return EditorOffer(
        offer_id=offer_id,
        name=item["name"] if item else None,
        share=share,
        new_share=new_share,
        disabled=link_state == "disabled" or bool(item and item.get("state") == "disabled"),
        deleted=item is None,
        pinned=bool(known and known.pinned),
        published=known.published if known else True,
    )


def _stream_view(
    stream: dict,
    catalog: dict[int, dict],
    known: dict[tuple[int, int], KnownOffer],
    draft: StreamDraft | None,
) -> EditorStream:
    offers: list[EditorOffer] = []
    archive: list[EditorOffer] = []
    is_offer_stream = _is_offer_stream(stream)
    if is_offer_stream:
        links = stream.get("offers") or []
        in_keitaro = {o["offer_id"]: o for o in links}
        current = draft.offers if draft else _links(stream)

        def row(offer_id: int, new_share: int | None) -> EditorOffer:
            link = in_keitaro.get(offer_id) or {}
            return _offer_row(
                offer_id, link.get("share"), new_share, catalog, known.get((stream["id"], offer_id)), link.get("state")
            )

        offers = [row(o["offer_id"], o["share"]) for o in current]
        active = {o["offer_id"] for o in current}
        # Архивный оффер — известный потоку, но не активный; порядок не хранится, сортируем по id.
        archive = [
            row(offer_id, None)
            for (stream_id, offer_id) in sorted(known)
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
        draft=draft is not None,
        conflict=draft is not None and _is_conflict(draft, stream),
        offers=offers,
        archive=archive,
    )


async def _build_view(
    session: AsyncSession, campaign: dict, streams: list[dict], catalog: dict[int, dict]
) -> EditorView:
    """Сверяет хранилище с Keitaro, убирает черновики, совпавшие с Keitaro, и собирает ответ.

    Черновик потока, который пропал из Keitaro или перестал быть оффер-потоком, удаляется
    с сообщением уровня кампании; известные офферы такого потока остаются.
    """
    offer_streams = [s for s in streams if _is_offer_stream(s)]
    offer_stream_ids = {s["id"] for s in offer_streams}
    drafts: dict[int, StreamDraft] = {}
    notices: list[str] = []
    for d in await session.scalars(select(StreamDraft).where(StreamDraft.campaign_id == campaign["id"])):
        if d.stream_id in offer_stream_ids:
            drafts[d.stream_id] = d
        else:
            await session.delete(d)
            name = d.stream_name or f"#{d.stream_id}"
            notices.append(f"Поток «{name}» удалён в Keitaro, неопубликованные правки потеряны")
    known = await _sync_known_offers(session, campaign["id"], offer_streams, drafts)
    for s in offer_streams:
        draft = drafts.get(s["id"])
        if draft and _same_shares(draft.offers, _links(s)):
            await _drop_draft(session, s["id"])
            del drafts[s["id"]]
            known = {k: v for k, v in known.items() if k[0] != s["id"] or v.published}
    await session.commit()
    return EditorView(
        campaign=EditorCampaign(
            id=campaign["id"],
            name=campaign["name"],
            state=campaign["state"],
            keitaro_url=keitaro_campaign_url(campaign["id"]),
        ),
        streams=[_stream_view(s, catalog, known, drafts.get(s["id"])) for s in streams],
        notices=notices,
    )


async def load_campaign(session: AsyncSession, keitaro: KeitaroClient, campaign_id: int) -> EditorView:
    """Читает кампанию и её потоки из Keitaro и сверяет с ними известные офферы и черновики.

    Fetch в интерфейсе вызывает эту же загрузку.
    """
    campaign, streams, catalog = await _read_keitaro(keitaro, campaign_id)
    return await _build_view(session, campaign, streams, catalog)


# --- черновик ---


@dataclass
class _Context:
    """Всё, что нужно действию над оффер-потоком: прочитанное из Keitaro и из хранилища."""

    campaign: dict
    streams: list[dict]
    catalog: dict[int, dict]
    stream: dict
    draft: StreamDraft | None
    # Текущий состав: черновика, если он есть, иначе Keitaro.
    current: list[DraftOffer]
    # Известные офферы потока по offer_id.
    known: dict[int, KnownOffer]

    @property
    def campaign_id(self) -> int:
        return self.campaign["id"]

    @property
    def stream_id(self) -> int:
        return self.stream["id"]

    async def view(self, session: AsyncSession) -> EditorView:
        return await _build_view(session, self.campaign, self.streams, self.catalog)


# Правка черновика: по контексту потока возвращает новый состав (до пересчёта долей) или бросает отказ.
_Change = Callable[[_Context], Awaitable[list[DraftOffer]]]


def _refuse(message: str) -> ApiError:
    # Мгновенный отказ действия: фронт показывает его всплывающим сообщением.
    return ApiError("validation_error", message)


async def _load_stream(session: AsyncSession, keitaro: KeitaroClient, campaign_id: int, stream_id: int) -> _Context:
    """Читает кампанию из Keitaro и находит в ней оффер-поток с черновиком и известными офферами."""
    campaign, streams, catalog = await _read_keitaro(keitaro, campaign_id)
    stream = next((s for s in streams if s["id"] == stream_id and _is_offer_stream(s)), None)
    if stream is None:
        raise ApiError("not_found", f"Оффер-поток #{stream_id} не найден в кампании")
    draft = await session.get(StreamDraft, stream_id)
    known = {k.offer_id: k for k in await session.scalars(select(KnownOffer).where(KnownOffer.stream_id == stream_id))}
    return _Context(
        campaign=campaign,
        streams=streams,
        catalog=catalog,
        stream=stream,
        draft=draft,
        current=draft.offers if draft else _links(stream),
        known=known,
    )


async def _edit(
    session: AsyncSession, keitaro: KeitaroClient, campaign_id: int, stream_id: int, change: _Change
) -> EditorView:
    """Применяет правку к черновику потока (создаёт его со снимком `base_offers`) и пересчитывает доли."""
    ctx = await _load_stream(session, keitaro, campaign_id, stream_id)

    changed = await change(ctx)
    offers = recompute(changed, {offer_id for offer_id, k in ctx.known.items() if k.pinned})

    draft = ctx.draft
    if draft:
        draft.offers = offers
    else:
        draft = StreamDraft(stream_id=stream_id, campaign_id=campaign_id, offers=offers, base_offers=_links(ctx.stream))
        session.add(draft)
    draft.stream_name = ctx.stream.get("name") or ""
    await session.flush()
    return await ctx.view(session)


def _is_active(offers: list[DraftOffer], offer_id: int) -> bool:
    return any(o["offer_id"] == offer_id for o in offers)


def _bring_back(offers: list[DraftOffer], offer_id: int) -> list[DraftOffer]:
    # Вернувшийся оффер встаёт в конец порядка потока.
    return [*offers, DraftOffer(offer_id=offer_id, share=0)]


async def add_offer(
    session: AsyncSession, keitaro: KeitaroClient, campaign_id: int, stream_id: int, offer_id: int
) -> EditorView:
    """Add: новый оффер заводится неопубликованным, архивный возвращается (как Bring back)."""

    async def change(ctx: _Context) -> list[DraftOffer]:
        if _is_active(ctx.current, offer_id):
            raise _refuse(f"Оффер #{offer_id} уже в потоке")
        try:
            await keitaro.get_offer(offer_id)
        except KeitaroError as err:
            if err.status == 404:
                raise ApiError(
                    "validation_error", VALIDATION_MESSAGE, fields={"offer_id": f"Оффер #{offer_id} не найден в Keitaro"}
                ) from None
            raise
        if offer_id not in ctx.known:
            session.add(KnownOffer(stream_id=stream_id, offer_id=offer_id, campaign_id=campaign_id,
                                   pinned=False, published=False))
        return _bring_back(ctx.current, offer_id)

    return await _edit(session, keitaro, campaign_id, stream_id, change)


async def remove_offer(
    session: AsyncSession, keitaro: KeitaroClient, campaign_id: int, stream_id: int, offer_id: int
) -> EditorView:
    """Remove: оффер уходит в архив, закрепление снимается; последний активный убрать нельзя."""

    async def change(ctx: _Context) -> list[DraftOffer]:
        if not _is_active(ctx.current, offer_id):
            raise _refuse(f"Оффера #{offer_id} нет в потоке")
        if len(ctx.current) == 1:
            raise _refuse("Нельзя убрать последний оффер потока")
        if offer_id in ctx.known:
            ctx.known[offer_id].pinned = False
        return [o for o in ctx.current if o["offer_id"] != offer_id]

    return await _edit(session, keitaro, campaign_id, stream_id, change)


async def bring_back_offer(
    session: AsyncSession, keitaro: KeitaroClient, campaign_id: int, stream_id: int, offer_id: int
) -> EditorView:
    """Bring back: архивный оффер встаёт в конец потока; удалённый в Keitaro вернуть нельзя."""

    async def change(ctx: _Context) -> list[DraftOffer]:
        if offer_id not in ctx.known or _is_active(ctx.current, offer_id):
            raise _refuse(f"Оффер #{offer_id} не в архиве потока")
        if offer_id not in ctx.catalog:
            raise _refuse(f"Оффер #{offer_id} удалён в Keitaro, вернуть нельзя")
        return _bring_back(ctx.current, offer_id)

    return await _edit(session, keitaro, campaign_id, stream_id, change)


# --- ручная доля, закрепление, «Пересчитать» ---


def _pin(session: AsyncSession, ctx: _Context, *, offer_id: int, share: int) -> None:
    """Закрепляет долю `share` активного оффера; отказ, если Σ закреплённых станет больше 100.

    `pinned` пишется в `stream_offers` и черновик сам по себе не создаёт.
    """
    known = ctx.known
    if not _is_active(ctx.current, offer_id):
        raise _refuse(f"Оффера #{offer_id} нет в потоке")
    total = share + sum(
        o["share"] for o in ctx.current
        if o["offer_id"] != offer_id and o["offer_id"] in known and known[o["offer_id"]].pinned
    )
    if total > 100:
        raise _refuse(f"Сумма закреплённых долей станет {total}, больше 100")
    if offer_id not in known:
        # Активный оффер известен после загрузки; строка заводится на случай гонки с Keitaro.
        known[offer_id] = KnownOffer(
            stream_id=ctx.stream_id, offer_id=offer_id, campaign_id=ctx.campaign_id, pinned=False, published=True
        )
        session.add(known[offer_id])
    known[offer_id].pinned = True


async def set_share(
    session: AsyncSession, keitaro: KeitaroClient, campaign_id: int, stream_id: int, offer_id: int, share: int
) -> EditorView:
    """Ручной ввод доли: доля закрепляется, остальные делят то, что осталось от 100."""

    async def change(ctx: _Context) -> list[DraftOffer]:
        _pin(session, ctx, offer_id=offer_id, share=share)
        return [DraftOffer(offer_id=offer_id, share=share) if o["offer_id"] == offer_id else o for o in ctx.current]

    return await _edit(session, keitaro, campaign_id, stream_id, change)


async def pin_offer(
    session: AsyncSession, keitaro: KeitaroClient, campaign_id: int, stream_id: int, offer_id: int
) -> EditorView:
    """Булавка: закрепляет текущую долю оффера без пересчёта; черновик не создаётся."""
    ctx = await _load_stream(session, keitaro, campaign_id, stream_id)
    share = next((o["share"] for o in ctx.current if o["offer_id"] == offer_id), 0)
    _pin(session, ctx, offer_id=offer_id, share=share)
    await session.flush()
    return await ctx.view(session)


async def unpin_offer(
    session: AsyncSession, keitaro: KeitaroClient, campaign_id: int, stream_id: int, offer_id: int
) -> EditorView:
    """Снятие закрепления: оффер возвращается в общий пул, доли пересчитываются."""

    async def change(ctx: _Context) -> list[DraftOffer]:
        if not _is_active(ctx.current, offer_id):
            raise _refuse(f"Оффера #{offer_id} нет в потоке")
        if offer_id in ctx.known:
            ctx.known[offer_id].pinned = False
        return ctx.current

    return await _edit(session, keitaro, campaign_id, stream_id, change)


async def recompute_stream(
    session: AsyncSession, keitaro: KeitaroClient, campaign_id: int, stream_id: int
) -> EditorView:
    """«Пересчитать»: доли по общему правилу с учётом закреплённых, результат — черновик."""

    async def change(ctx: _Context) -> list[DraftOffer]:
        return ctx.current

    return await _edit(session, keitaro, campaign_id, stream_id, change)


async def cancel_draft(session: AsyncSession, keitaro: KeitaroClient, campaign_id: int, stream_id: int) -> EditorView:
    """Cancel: черновик и неопубликованные офферы потока удаляются, остаётся состав Keitaro."""
    campaign, streams, catalog = await _read_keitaro(keitaro, campaign_id)
    await _drop_draft(session, stream_id)
    return await _build_view(session, campaign, streams, catalog)


# --- публикация ---

CONFLICT_MESSAGE = "Поток в Keitaro изменился после начала правок"
REREAD_FAILED_MESSAGE = "Опубликовано, но не удалось перечитать поток — нажмите Fetch"
MISMATCH_MESSAGE = "Keitaro сохранил поток не так, как отправлено"


def _check_publishable(offers: list[DraftOffer], catalog: dict[int, dict]) -> None:
    """Черновик можно публиковать: доли целые 0..100 с суммой 100, есть активный оффер,
    все офферы есть в `GET /offers`. Иначе — `validation_error`."""
    if not offers:
        raise _refuse("В потоке должен остаться хотя бы один оффер")
    shares = [o["share"] for o in offers]
    if any(isinstance(s, bool) or not isinstance(s, int) or not 0 <= s <= 100 for s in shares):
        raise _refuse("Доля — целое от 0 до 100")
    if sum(shares) != 100:
        raise _refuse(f"Сумма долей — {sum(shares)}%, а должна быть 100%")
    missing = next((o["offer_id"] for o in offers if o["offer_id"] not in catalog), None)
    if missing is not None:
        raise _refuse(f"Оффер #{missing} не найден в Keitaro")


async def publish_draft(
    session: AsyncSession, keitaro: KeitaroClient, campaign_id: int, stream_id: int, *, overwrite: bool = False
) -> PublishResult:
    """Публикует черновик потока в Keitaro.

    Шаги: проверка черновика → сверка потока с `base_offers` (расхождение — `draft_conflict`,
    если нет `overwrite`) → `PUT /streams/{id}` → повторное чтение и сверка с отправленным →
    удаление черновика. Сбой PUT пробрасывается как ошибка Keitaro, черновик остаётся.
    """
    ctx = await _load_stream(session, keitaro, campaign_id, stream_id)
    stream, draft = ctx.stream, ctx.draft
    if draft is None:
        raise _refuse("Нет неопубликованных изменений")
    sent = [DraftOffer(offer_id=o["offer_id"], share=o["share"]) for o in draft.offers]
    _check_publishable(sent, ctx.catalog)
    if _is_conflict(draft, stream) and not overwrite:
        raise ApiError("draft_conflict", CONFLICT_MESSAGE)

    saved = await keitaro.update_stream(stream_id, {"offers": sent})

    # PUT прошёл: офферы черновика опубликованы, сам черновик больше не нужен.
    for k in ctx.known.values():
        if _is_active(sent, k.offer_id):
            k.published = True
    await session.delete(draft)
    await session.flush()

    warning = None
    try:
        streams = await _list_streams(keitaro, campaign_id)
    except KeitaroError:
        # Показываем поток по ответу PUT (а без офферов в нём — отправленный состав).
        warning = REREAD_FAILED_MESSAGE
        after_put = {**stream, "offers": sent, **(saved if isinstance(saved, dict) else {})}
        streams = [after_put if s["id"] == stream_id else s for s in ctx.streams]
    else:
        reread = next((s for s in streams if s["id"] == stream_id), None)
        if reread is None or not _same_shares(_links(reread), sent):
            warning = MISMATCH_MESSAGE
    return PublishResult(view=await _build_view(session, ctx.campaign, streams, ctx.catalog), warning=warning)
