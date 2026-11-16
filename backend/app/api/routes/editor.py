"""Редактор офферов любой кампании Keitaro."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_keitaro
from app.db.session import get_session
from app.schemas.editor import EditorView
from app.services import editor
from app.services.keitaro import KeitaroClient

router = APIRouter(prefix="/editor", tags=["editor"])


@router.get("/campaigns/{campaign_id}", response_model=EditorView)
async def load_campaign(
    campaign_id: int,
    session: AsyncSession = Depends(get_session),
    keitaro: KeitaroClient = Depends(get_keitaro),
):
    """Открытие кампании и Fetch: потоки из Keitaro + сверка известных офферов."""
    return await editor.load_campaign(session, keitaro, campaign_id)
