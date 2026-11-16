from pydantic import BaseModel


class OfferShort(BaseModel):
    """Оффер из справочника Keitaro."""

    id: int
    name: str
