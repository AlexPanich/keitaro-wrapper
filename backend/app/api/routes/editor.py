"""Редактор офферов любой кампании Keitaro.

Каждое действие с черновиком отвечает полным состоянием кампании, как загрузка.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_keitaro
from app.db.session import get_session
from app.schemas.editor import EditorView, OfferAdd
from app.services import editor
from app.services.keitaro import KeitaroClient

router = APIRouter(prefix="/editor", tags=["editor"])

STREAM = "/campaigns/{campaign_id}/streams/{stream_id}"


@router.get("/campaigns/{campaign_id}", response_model=EditorView)
async def load_campaign(
    campaign_id: int,
    session: AsyncSession = Depends(get_session),
    keitaro: KeitaroClient = Depends(get_keitaro),
):
    """Открытие кампании и Fetch: потоки из Keitaro + сверка известных офферов и черновиков."""
    return await editor.load_campaign(session, keitaro, campaign_id)


@router.post(f"{STREAM}/offers", response_model=EditorView)
async def add_offer(
    campaign_id: int,
    stream_id: int,
    data: OfferAdd,
    session: AsyncSession = Depends(get_session),
    keitaro: KeitaroClient = Depends(get_keitaro),
):
    """Add: оффер в конец потока (архивный — как Bring back), доли пересчитываются."""
    return await editor.add_offer(session, keitaro, campaign_id, stream_id, data.offer_id)


@router.delete(f"{STREAM}/offers/{{offer_id}}", response_model=EditorView)
async def remove_offer(
    campaign_id: int,
    stream_id: int,
    offer_id: int,
    session: AsyncSession = Depends(get_session),
    keitaro: KeitaroClient = Depends(get_keitaro),
):
    """Remove: оффер уходит в архив черновика, доли пересчитываются."""
    return await editor.remove_offer(session, keitaro, campaign_id, stream_id, offer_id)


@router.post(f"{STREAM}/offers/{{offer_id}}/bring-back", response_model=EditorView)
async def bring_back_offer(
    campaign_id: int,
    stream_id: int,
    offer_id: int,
    session: AsyncSession = Depends(get_session),
    keitaro: KeitaroClient = Depends(get_keitaro),
):
    """Bring back: архивный оффер в конец потока, доли пересчитываются."""
    return await editor.bring_back_offer(session, keitaro, campaign_id, stream_id, offer_id)


@router.delete(f"{STREAM}/draft", response_model=EditorView)
async def cancel_draft(
    campaign_id: int,
    stream_id: int,
    session: AsyncSession = Depends(get_session),
    keitaro: KeitaroClient = Depends(get_keitaro),
):
    """Cancel: удаляет черновик потока и его неопубликованные офферы."""
    return await editor.cancel_draft(session, keitaro, campaign_id, stream_id)
