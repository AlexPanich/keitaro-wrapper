from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CampaignCreate(BaseModel):
    """Форма создаватора. Нормализация и сверка с Keitaro — в ``services/campaign_builder.py``."""

    name: str = Field(max_length=255, description="Пробелы по краям обрезаются; из одних пробелов — ошибка")
    geo: str = Field(description="ISO 3166-1 alpha-2 через запятую, например «de, FR»")
    offer_id: int | None = Field(default=None, gt=0, description="ID оффера в Keitaro; null — оффер не выбран (ошибка поля)")
    group_id: int = Field(gt=0, description="ID группы кампаний в Keitaro")
    domain_id: int | None = Field(default=None, description="ID домена; null — не выбрано")
    traffic_source_id: int | None = Field(default=None, description="ID источника; null или 0 — не выбрано")


class CampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    keitaro_id: int
    name: str
    alias: str | None
    geo: list[str] = Field(description="ISO 3166-1 alpha-2 коды стран гео-потока")
    initial_offer_id: int
    domain_id: int | None
    group_id: int | None
    traffic_source_id: int | None
    geo_stream_id: int
    offer_stream_id: int
    created_at: datetime


class CampaignCreated(CampaignRead):
    """Результат создаватора: строка журнала и URL кампании (если выбран домен)."""

    url: str | None = Field(description="https://<домен>/<alias>; null, если домен не выбран")
