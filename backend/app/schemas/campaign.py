from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    geo: str = Field(min_length=2, max_length=2, description="ISO 3166-1 alpha-2, например RU")
    offer_id: int = Field(gt=0, description="ID оффера в Keitaro")


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
