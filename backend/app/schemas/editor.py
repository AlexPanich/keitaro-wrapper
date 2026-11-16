"""Схемы редактора офферов: поиск кампании и состояние её потоков."""

from pydantic import BaseModel, Field


class CampaignShort(BaseModel):
    """Кампания Keitaro в результатах поиска."""

    id: int
    name: str
    # `active` / `disabled` — как отдаёт Keitaro.
    state: str


class EditorCampaign(BaseModel):
    """Карточка открытой в редакторе кампании."""

    id: int
    name: str
    state: str
    # Ссылка «Открыть в Keitaro» на кампанию в админке трекера.
    keitaro_url: str


class EditorOffer(BaseModel):
    """Строка оффера в оффер-потоке (активная или архивная)."""

    offer_id: int
    # Название из `GET /offers`; `None` — оффера там нет («удалён в Keitaro»).
    name: str | None
    # Доля в Keitaro; у архивного оффера — `None`. Сумма в потоке может быть ≠ 100.
    share: int | None
    # Оффер выключен в Keitaro, но в потоке считается обычным активным.
    disabled: bool
    # Оффера нет в `GET /offers`.
    deleted: bool
    pinned: bool


class EditorStream(BaseModel):
    """Поток кампании. Офферы и архив заполнены только у оффер-потоков (`schema: landings`)."""

    id: int
    name: str
    # `forced` / `regular` / `default`.
    type: str
    position: int | None
    state: str
    # Имя `schema` занято в BaseModel, поэтому поле называется иначе, а в JSON — `schema`.
    stream_schema: str = Field(serialization_alias="schema")
    is_offer_stream: bool
    offers: list[EditorOffer]
    archive: list[EditorOffer]


class EditorView(BaseModel):
    """Всё, что редактор показывает по кампании после загрузки или Fetch."""

    campaign: EditorCampaign
    # В порядке проверки Keitaro: forced → regular (position, id) → default.
    streams: list[EditorStream]
