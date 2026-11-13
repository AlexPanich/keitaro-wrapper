"""Создаватор кампаний: кампания + 2 потока (гео → Google, остальные → оффер)."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Campaign
from app.schemas.campaign import CampaignCreate
from app.services.keitaro import KeitaroClient


async def create_campaign(
    session: AsyncSession, keitaro: KeitaroClient, data: CampaignCreate
) -> Campaign:
    # TODO:
    #  1. keitaro.create_campaign(name, domain_id, group_id, traffic_source_id)
    #  2. поток №1: фильтр country == data.geo, action redirect → settings.fallback_redirect_url
    #  3. поток №2: schema landings/offers, offers=[{offer_id, share: 100}]
    #  4. сохранить Campaign в БД
    raise NotImplementedError
