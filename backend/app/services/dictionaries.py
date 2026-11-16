"""Справочники Keitaro для создаватора и редактора: поиск оффера, группы, домены, источники.

Поиска по имени в Keitaro API нет (#6), поэтому тянем полный список и фильтруем
у себя. Кэша нет: каждый запрос идёт в Keitaro.
"""

import logging

from app.schemas.dictionary import Defaults, DictionaryItem
from app.schemas.offer import OfferShort
from app.services.keitaro import KeitaroClient

logger = logging.getLogger(__name__)


def _items(raw: list[dict]) -> list[DictionaryItem]:
    return [DictionaryItem(id=r["id"], name=r["name"]) for r in raw]


async def list_groups(keitaro: KeitaroClient) -> list[DictionaryItem]:
    """Группы кампаний (``GET /groups?type=campaigns``)."""
    return _items(await keitaro.list_groups("campaigns"))


async def list_domains(keitaro: KeitaroClient) -> list[DictionaryItem]:
    return _items(await keitaro.list_domains())


async def list_traffic_sources(keitaro: KeitaroClient) -> list[DictionaryItem]:
    return _items(await keitaro.list_traffic_sources())


def _checked(env_name: str, value: int | None, items: list[DictionaryItem]) -> int | None:
    """Дефолт из ``.env``, если такой id есть в справочнике; иначе ``None`` и warning в лог."""
    if value is None:
        return None
    if any(item.id == value for item in items):
        return value
    logger.warning("%s=%s нет в справочнике Keitaro, предвыбор не используется", env_name, value)
    return None


async def get_defaults(
    keitaro: KeitaroClient,
    group_id: int | None,
    domain_id: int | None,
    traffic_source_id: int | None,
) -> Defaults:
    """Предвыбор селектов создаватора: дефолты ``KEITARO_DEFAULT_*_ID``, сверенные со справочниками."""
    return Defaults(
        group_id=_checked("KEITARO_DEFAULT_GROUP_ID", group_id, await list_groups(keitaro)),
        domain_id=_checked("KEITARO_DEFAULT_DOMAIN_ID", domain_id, await list_domains(keitaro)),
        traffic_source_id=_checked(
            "KEITARO_DEFAULT_TRAFFIC_SOURCE_ID", traffic_source_id, await list_traffic_sources(keitaro)
        ),
    )


def matches(item: dict, q: str) -> bool:
    """Подстрока в ``name`` без учёта регистра или точное совпадение по ``id``.

    Общее правило поиска для офферов и кампаний.
    """
    if q.casefold() in str(item.get("name", "")).casefold():
        return True
    return q.isdigit() and int(q) == item.get("id")


async def search_offers(keitaro: KeitaroClient, q: str = "") -> list[OfferShort]:
    """Офферы Keitaro, подходящие под ``q`` (пустой ``q`` — все), в урезанной проекции."""
    q = q.strip()
    return [
        OfferShort(id=o["id"], name=o["name"], group=o.get("group"), state=o.get("state"))
        for o in await keitaro.list_offers()
        if not q or matches(o, q)
    ]
