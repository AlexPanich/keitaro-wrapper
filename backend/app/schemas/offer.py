from pydantic import BaseModel


class OfferShort(BaseModel):
    """Оффер из справочника Keitaro (урезанная проекция для поиска)."""

    id: int
    name: str
    group: str | None = None
    state: str | None = None
