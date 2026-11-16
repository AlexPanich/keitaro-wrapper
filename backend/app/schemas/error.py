from pydantic import BaseModel


class KeitaroDetails(BaseModel):
    """Подробности неудачного запроса к Keitaro для свёрнутых «Подробностей» на фронте."""

    status: int | None
    method: str
    path: str
    body: str | None


class ErrorResponse(BaseModel):
    """Единый конверт ошибки API."""

    code: str
    message: str
    fields: dict[str, str] = {}
    keitaro: KeitaroDetails | None = None
