"""Прокси справочников Keitaro для фронта (выпадающие списки)."""

from fastapi import APIRouter, Depends

from app.api.deps import get_keitaro
from app.schemas.editor import CampaignShort
from app.schemas.offer import OfferShort
from app.services import editor
from app.services.keitaro import KeitaroClient

router = APIRouter(prefix="/keitaro", tags=["keitaro"])


@router.get("/offers", response_model=list[OfferShort])
async def offers(keitaro: KeitaroClient = Depends(get_keitaro)):
    return [OfferShort(id=o["id"], name=o["name"]) for o in await keitaro.list_offers()]


@router.get("/campaigns", response_model=list[CampaignShort])
async def campaigns(q: str = "", keitaro: KeitaroClient = Depends(get_keitaro)):
    """Поиск кампании для редактора: подстрока названия или ID."""
    return await editor.search_campaigns(keitaro, q)
