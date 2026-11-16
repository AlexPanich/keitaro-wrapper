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
    # Доля в Keitaro; `None` — оффера нет в потоке Keitaro (архивный или новый в черновике).
    # Сумма в потоке может быть ≠ 100.
    share: int | None
    # Доля «Станет»: из черновика, а без черновика — как в Keitaro; у архивного — `None`.
    new_share: int | None
    # Оффер выключен в Keitaro, но в потоке считается обычным активным.
    disabled: bool
    # Оффера нет в `GET /offers`.
    deleted: bool
    pinned: bool
    # `False` — оффер добавлен в черновике и ещё ни разу не публиковался («новый»).
    published: bool


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
    # У потока есть черновик: `offers` и `archive` показывают состав черновика.
    draft: bool
    # Поток в Keitaro изменился после начала правок: состав или доли не совпадают с `base_offers`.
    conflict: bool = False
    # Активные офферы в порядке потока (черновика, если он есть).
    offers: list[EditorOffer]
    # Архивные офферы, по id.
    archive: list[EditorOffer]


class OfferAdd(BaseModel):
    """Тело Add: оффер из общего поиска."""

    offer_id: int


class EditorView(BaseModel):
    """Всё, что редактор показывает по кампании после загрузки или Fetch."""

    campaign: EditorCampaign
    # В порядке проверки Keitaro: forced → regular (position, id) → default.
    streams: list[EditorStream]
    # Сообщения уровня кампании, например о потоке с черновиком, удалённом в Keitaro.
    notices: list[str] = []


class PublishRequest(BaseModel):
    """Тело публикации черновика."""

    # Явное согласие перезаписать поток, изменившийся в Keitaro после начала правок.
    overwrite: bool = False


class PublishResult(BaseModel):
    """Итог публикации: состояние кампании и, если что-то пошло не так после PUT, предупреждение."""

    view: EditorView
    # Жёлтая плашка: PUT прошёл, но поток не удалось перечитать или Keitaro сохранил его иначе.
    warning: str | None = None
