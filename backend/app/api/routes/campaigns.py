from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_keitaro
from app.db.session import get_session
from app.models import Campaign
from app.schemas.campaign import CampaignCreate, CampaignRead
from app.services import campaign_builder
from app.services.keitaro import KeitaroClient

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("", response_model=list[CampaignRead])
async def list_campaigns(session: AsyncSession = Depends(get_session)):
    result = await session.scalars(select(Campaign).order_by(Campaign.id.desc()))
    return result.all()


@router.post("", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    data: CampaignCreate,
    session: AsyncSession = Depends(get_session),
    keitaro: KeitaroClient = Depends(get_keitaro),
):
    return await campaign_builder.create_campaign(session, keitaro, data)
