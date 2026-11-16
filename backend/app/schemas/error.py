from typing import Literal

from pydantic import BaseModel

# Закрытый список кодов ошибок (решение в #15). Новый код добавляется только
# вместе с union-типом ``ErrorCode`` во ``frontend/src/api.ts``.
ErrorCode = Literal[
    "validation_error",
    "not_found",
    "draft_conflict",
    "alias_exhausted",
    "keitaro_error",
    "keitaro_auth",
    "keitaro_unavailable",
    "create_rolled_back",
    "create_orphaned",
    "internal_error",
]


class KeitaroDetails(BaseModel):
    """Подробности неудачного запроса к Keitaro для свёрнутых «Подробностей» на фронте."""

    status: int | None
    method: str
    path: str
    body: str | None


class ErrorResponse(BaseModel):
    """Единый конверт ошибки API."""

    code: ErrorCode
    message: str
    fields: dict[str, str] = {}
    keitaro: KeitaroDetails | None = None
    # Ссылка на кампанию в админке Keitaro, когда пользователю нужно что-то сделать там руками
    # (``create_orphaned``: удалить полусозданную кампанию).
    keitaro_url: str | None = None
