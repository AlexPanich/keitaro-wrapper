"""Состояние редактора офферов. Ключи — ID из Keitaro, FK на журнал кампаний нет:
редактор работает с любой кампанией Keitaro."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class KnownOffer(Base):
    """Известный оффер потока: был в Keitaro или добавлен в черновик.

    Статус «архивный» и позиция не хранятся: архивный — известный, но не активный
    (в черновике, если он есть, иначе в Keitaro); порядок задаёт массив `offers`.
    """

    __tablename__ = "stream_offers"

    # Составной PK (stream_id, offer_id) — оффер известен потоку не больше одного раза.
    stream_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    offer_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    campaign_id: Mapped[int] = mapped_column(Integer)
    pinned: Mapped[bool] = mapped_column(Boolean, server_default="false")
    published: Mapped[bool] = mapped_column(Boolean, server_default="false")


class StreamDraft(Base):
    """Черновик потока: желаемый список офферов, ещё не отправленный в Keitaro.

    `offers` — упорядоченный `[{offer_id, share}]`, один в один тело `PUT /streams/{id}`;
    `base_offers` — снимок потока в Keitaro на момент создания черновика.
    """

    __tablename__ = "stream_drafts"

    stream_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    campaign_id: Mapped[int] = mapped_column(Integer)
    offers: Mapped[list[dict]] = mapped_column(JSON)
    base_offers: Mapped[list[dict]] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
