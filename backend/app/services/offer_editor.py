"""Редактор офферов существующей кампании."""

from app.schemas.offer import StreamOffer
from app.services.keitaro import KeitaroClient


async def list_offers(keitaro: KeitaroClient, campaign_id: int) -> list[StreamOffer]:
    # TODO: найти оффер-поток кампании и вернуть его офферы с долями
    raise NotImplementedError


async def add_offer(keitaro: KeitaroClient, campaign_id: int, offer_id: int) -> list[StreamOffer]:
    # TODO: добавить оффер в поток и пересчитать доли так, чтобы сумма = 100
    raise NotImplementedError


async def remove_offer(keitaro: KeitaroClient, campaign_id: int, offer_id: int) -> list[StreamOffer]:
    # TODO: удалить оффер из потока и перераспределить доли
    raise NotImplementedError
