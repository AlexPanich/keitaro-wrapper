from pydantic import BaseModel


class DictionaryItem(BaseModel):
    """Пункт справочника Keitaro для селекта: группа, домен или источник."""

    id: int
    name: str


class Defaults(BaseModel):
    """Предвыбор селектов создаватора из ``.env``; ``None`` — предвыбора нет."""

    group_id: int | None
    domain_id: int | None
    traffic_source_id: int | None
