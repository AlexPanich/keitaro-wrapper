"""Справочники Keitaro для фронта: поиск оффера и списки для селектов."""

from fastapi import APIRouter, Depends

from app.api.deps import get_keitaro
from app.core.config import settings
from app.schemas.dictionary import Defaults, DictionaryItem
from app.schemas.editor import CampaignShort
from app.schemas.offer import OfferShort
from app.services import dictionaries, editor
from app.services.keitaro import KeitaroClient

router = APIRouter(prefix="/keitaro", tags=["keitaro"])


@router.get("/offers", response_model=list[OfferShort])
async def offers(q: str = "", keitaro: KeitaroClient = Depends(get_keitaro)):
    return await dictionaries.search_offers(keitaro, q)


@router.get("/groups", response_model=list[DictionaryItem])
async def groups(keitaro: KeitaroClient = Depends(get_keitaro)):
    return await dictionaries.list_groups(keitaro)


@router.get("/domains", response_model=list[DictionaryItem])
async def domains(keitaro: KeitaroClient = Depends(get_keitaro)):
    return await dictionaries.list_domains(keitaro)


@router.get("/traffic_sources", response_model=list[DictionaryItem])
async def traffic_sources(keitaro: KeitaroClient = Depends(get_keitaro)):
    return await dictionaries.list_traffic_sources(keitaro)


@router.get("/defaults", response_model=Defaults)
async def defaults(keitaro: KeitaroClient = Depends(get_keitaro)):
    return await dictionaries.get_defaults(
        keitaro,
        group_id=settings.keitaro_default_group_id,
        domain_id=settings.keitaro_default_domain_id,
        traffic_source_id=settings.keitaro_default_traffic_source_id,
    )


@router.get("/campaigns", response_model=list[CampaignShort])
async def campaigns(q: str = "", keitaro: KeitaroClient = Depends(get_keitaro)):
    """Поиск кампании для редактора: подстрока названия или ID."""
    return await editor.search_campaigns(keitaro, q)
