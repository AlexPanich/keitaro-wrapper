"""Создаватор кампаний: кампания + 2 потока (гео → заглушка, остальные → оффер).

Решения — в #5, #12, #14; откат частичного сбоя — #15, #21.
"""

import logging
import secrets
import string
from typing import NoReturn

import pycountry
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import VALIDATION_MESSAGE, ApiError
from app.models import Campaign
from app.schemas.campaign import CampaignCreate, CampaignCreated, CampaignRead
from app.services import dictionaries
from app.services.editor import keitaro_campaign_url
from app.services.keitaro import KeitaroClient, KeitaroError

logger = logging.getLogger(__name__)

ALIAS_ALPHABET = string.ascii_lowercase + string.digits
ALIAS_LENGTH = 8
ALIAS_ATTEMPTS = 3
ALIAS_TAKEN = "Alias has already used"
ALIAS_EXHAUSTED_MESSAGE = f"Не удалось подобрать свободный alias за {ALIAS_ATTEMPTS} попытки, попробуйте ещё раз"

COUNTRY_CODES = frozenset(c.alpha_2 for c in pycountry.countries)

# Шаги после ``POST /campaigns``, сбой которых откатывается удалением кампании.
STEP_GEO_STREAM = "создание гео-потока"
STEP_OFFER_STREAM = "создание оффер-потока"
STEP_JOURNAL = "запись в журнал"
STEP_REASONS = {
    STEP_GEO_STREAM: f"Keitaro отклонил шаг «{STEP_GEO_STREAM}»",
    STEP_OFFER_STREAM: f"Keitaro отклонил шаг «{STEP_OFFER_STREAM}»",
    STEP_JOURNAL: f"не удался шаг «{STEP_JOURNAL}»",  # это не Keitaro, а наше хранилище
}

REQUIRED = "Обязательное поле"
GEO_EMPTY = "Укажите хотя бы одну страну"


def _new_alias() -> str:
    return "".join(secrets.choice(ALIAS_ALPHABET) for _ in range(ALIAS_LENGTH))


def _parse_geo(raw: str) -> list[str]:
    """Коды стран из строки через запятую: верхний регистр, без пробелов и дублей, порядок сохраняется."""
    codes = (code.strip().upper() for code in raw.split(","))
    return list(dict.fromkeys(code for code in codes if code))


def _check_form(data: CampaignCreate) -> tuple[str, list[str], int]:
    """Проверки, которым не нужен Keitaro: название, гео, выбран ли оффер. Возвращает нормализованные значения."""
    fields: dict[str, str] = {}
    name = data.name.strip()
    if not name:
        fields["name"] = REQUIRED
    geo = _parse_geo(data.geo)
    unknown = [code for code in geo if code not in COUNTRY_CODES]
    if not geo:
        fields["geo"] = GEO_EMPTY
    elif unknown:
        fields["geo"] = f"Неизвестные коды: {', '.join(unknown)}"
    if data.offer_id is None:
        fields["offer_id"] = REQUIRED
    if fields:
        raise ApiError("validation_error", VALIDATION_MESSAGE, fields=fields)
    assert data.offer_id is not None
    return name, geo, data.offer_id


async def _check_keitaro(keitaro: KeitaroClient, data: CampaignCreate, offer_id: int) -> str | None:
    """Сверка id формы с Keitaro (без кэша, при каждом создании). Возвращает имя выбранного домена."""
    fields: dict[str, str] = {}
    domain: str | None = None

    groups = await dictionaries.list_groups(keitaro)
    if not any(g.id == data.group_id for g in groups):
        fields["group_id"] = f"Группы #{data.group_id} нет в Keitaro"
    if data.domain_id is not None:
        domain = next((d.name for d in await dictionaries.list_domains(keitaro) if d.id == data.domain_id), None)
        if domain is None:
            fields["domain_id"] = f"Домена #{data.domain_id} нет в Keitaro"
    if data.traffic_source_id:
        sources = await dictionaries.list_traffic_sources(keitaro)
        if not any(s.id == data.traffic_source_id for s in sources):
            fields["traffic_source_id"] = f"Источника #{data.traffic_source_id} нет в Keitaro"
    try:
        await keitaro.get_offer(offer_id)  # состояние оффера не важно: disabled — тоже оффер
    except KeitaroError as err:
        if err.status != 404:
            raise
        fields["offer_id"] = f"Оффера #{offer_id} нет в Keitaro"

    if fields:
        raise ApiError("validation_error", VALIDATION_MESSAGE, fields=fields)
    return domain


def _alias_taken(err: KeitaroError) -> bool:
    """422 ``{"alias":["Alias has already used"]}`` — alias занят активной кампанией."""
    return err.status == 422 and ALIAS_TAKEN in (err.keitaro.body or "")


async def _create_with_alias(keitaro: KeitaroClient, payload: dict) -> dict:
    """``POST /campaigns`` со случайным alias; занятый alias меняем, не больше ``ALIAS_ATTEMPTS`` раз."""
    for _ in range(ALIAS_ATTEMPTS):
        try:
            return await keitaro.create_campaign({**payload, "alias": _new_alias()})
        except KeitaroError as err:
            if not _alias_taken(err):
                raise
    raise ApiError("alias_exhausted", ALIAS_EXHAUSTED_MESSAGE)


async def _roll_back(keitaro: KeitaroClient, campaign_id: int, step: str, cause: Exception) -> NoReturn:
    """Компенсация частичного создания: ``DELETE /campaigns/{id}`` (в архив; ``clean_archive`` не трогаем).

    Всегда бросает ``create_rolled_back`` или, если удалить не удалось, ``create_orphaned``.
    В ``keitaro`` — подробности упавшего шага.
    """
    details = cause.keitaro if isinstance(cause, ApiError) else None
    if not isinstance(cause, KeitaroError):
        logger.error("Сбой шага «%s» после создания кампании #%s", step, campaign_id, exc_info=cause)
    try:
        await keitaro.delete_campaign(campaign_id)
    except Exception as err:
        logger.error(
            "Кампания #%s создана частично (сбой шага «%s») и не удалена: %s", campaign_id, step, err, exc_info=err
        )
        raise ApiError(
            "create_orphaned",
            f"Кампания #{campaign_id} создана частично и не удалена — удалите её в Keitaro вручную",
            keitaro=details,
            keitaro_url=keitaro_campaign_url(campaign_id),
        ) from cause
    reason = STEP_REASONS[step]
    raise ApiError(
        "create_rolled_back",
        f"Кампания не создана: {reason}. Созданная кампания #{campaign_id} удалена",
        keitaro=details,
    ) from cause


async def create_campaign(
    session: AsyncSession, keitaro: KeitaroClient, data: CampaignCreate
) -> CampaignCreated:
    name, geo, offer_id = _check_form(data)
    domain = await _check_keitaro(keitaro, data, offer_id)

    campaign = await _create_with_alias(
        keitaro,
        {
            "name": name,
            "group_id": data.group_id,
            "domain_id": data.domain_id,
            "traffic_source_id": data.traffic_source_id or 0,
        },
    )
    # Кампания уже есть в Keitaro: любой сбой дальше откатываем удалением (#21).
    step = STEP_GEO_STREAM
    try:
        geo_stream = await keitaro.create_stream(
            {
                "campaign_id": campaign["id"],
                "type": "regular",
                "name": f"Гео: {', '.join(geo)}",
                "position": 1,
                "schema": "redirect",
                "action_type": "http",
                "action_payload": settings.fallback_redirect_url,
                "filters": [{"name": "country", "mode": "accept", "payload": geo}],
            }
        )
        step = STEP_OFFER_STREAM
        offer_stream = await keitaro.create_stream(
            {
                "campaign_id": campaign["id"],
                "type": "regular",
                "name": "Офферы",
                "position": 2,
                "schema": "landings",
                "action_type": "http",
                "offers": [{"offer_id": offer_id, "share": 100}],
            }
        )

        step = STEP_JOURNAL
        row = Campaign(
            keitaro_id=campaign["id"],
            name=name,
            alias=campaign["alias"],
            geo=geo,
            initial_offer_id=offer_id,
            domain_id=data.domain_id,
            group_id=data.group_id,
            traffic_source_id=data.traffic_source_id or None,
            geo_stream_id=geo_stream["id"],
            offer_stream_id=offer_stream["id"],
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
    except Exception as err:
        await session.rollback()
        await _roll_back(keitaro, campaign["id"], step, err)

    url = f"https://{domain}/{row.alias}" if domain else None
    return CampaignCreated(**CampaignRead.model_validate(row).model_dump(), url=url)

