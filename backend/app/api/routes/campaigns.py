from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_keitaro
from app.db.session import get_session
from app.models import Campaign
from app.schemas.campaign import CampaignCreate, CampaignCreated, CampaignRead
from app.schemas.offer import OfferAdd, StreamOffer
from app.services import campaign_builder, offer_editor
from app.services.keitaro import KeitaroClient

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("", response_model=list[CampaignRead])
async def list_campaigns(session: AsyncSession = Depends(get_session)):
    result = await session.scalars(select(Campaign).order_by(Campaign.id.desc()))
    return result.all()


@router.post("", response_model=CampaignCreated, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    data: CampaignCreate,
    session: AsyncSession = Depends(get_session),
    keitaro: KeitaroClient = Depends(get_keitaro),
):
    return await campaign_builder.create_campaign(session, keitaro, data)


@router.get("/{keitaro_id}/offers", response_model=list[StreamOffer])
async def get_offers(keitaro_id: int, keitaro: KeitaroClient = Depends(get_keitaro)):
    return await offer_editor.list_offers(keitaro, keitaro_id)


@router.post("/{keitaro_id}/offers", response_model=list[StreamOffer])
async def add_offer(keitaro_id: int, data: OfferAdd, keitaro: KeitaroClient = Depends(get_keitaro)):
    return await offer_editor.add_offer(keitaro, keitaro_id, data.offer_id)


@router.delete("/{keitaro_id}/offers/{offer_id}", response_model=list[StreamOffer])
async def remove_offer(keitaro_id: int, offer_id: int, keitaro: KeitaroClient = Depends(get_keitaro)):
    return await offer_editor.remove_offer(keitaro, keitaro_id, offer_id)
