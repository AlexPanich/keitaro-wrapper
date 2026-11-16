from pydantic import BaseModel, Field


class OfferShort(BaseModel):
    """Оффер из справочника Keitaro (урезанная проекция для поиска)."""

    id: int
    name: str
    group: str | None = None
    state: str | None = None


class StreamOffer(BaseModel):
    """Оффер внутри потока кампании с его долей трафика."""

    offer_id: int
    name: str | None = None
    share: int = Field(ge=0, le=100)


class OfferAdd(BaseModel):
    offer_id: int = Field(gt=0)
