"""Единый конверт ошибок API.

Любая ошибка ручек уходит клиенту как ``{code, message, fields, keitaro}``.
Список ``code`` закрытый (решение в #15); новый код добавляется только вместе
с union-типом ``ErrorCode`` во ``frontend/src/api.ts``.
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.error import ErrorCode, ErrorResponse, KeitaroDetails

logger = logging.getLogger(__name__)

HTTP_STATUS: dict[ErrorCode, int] = {
    "validation_error": 422,
    "not_found": 404,
    "draft_conflict": 409,
    "alias_exhausted": 409,
    "keitaro_error": 502,
    "keitaro_auth": 502,
    "keitaro_unavailable": 504,
    "create_rolled_back": 502,
    "create_orphaned": 502,
    "internal_error": 500,
}

VALIDATION_MESSAGE = "Проверьте поля формы"
INTERNAL_MESSAGE = "Внутренняя ошибка сервиса"


class ApiError(Exception):
    """Ошибка, которую handler превращает в конверт. HTTP-статус выводится из ``code``."""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        fields: dict[str, str] | None = None,
        keitaro: KeitaroDetails | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.fields = fields or {}
        self.keitaro = keitaro

    @property
    def status_code(self) -> int:
        return HTTP_STATUS[self.code]


def error_response(
    code: ErrorCode,
    message: str,
    fields: dict[str, str] | None = None,
    keitaro: KeitaroDetails | None = None,
    *,
    status_code: int | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Конверт ошибки. ``status_code`` переопределяет статус из ``code`` — только для ошибок Starlette."""
    body = ErrorResponse(code=code, message=message, fields=fields or {}, keitaro=keitaro)
    return JSONResponse(
        status_code=status_code or HTTP_STATUS[code],
        content=body.model_dump(mode="json"),
        headers=headers,
    )


# Русские тексты для частых ошибок Pydantic; остальное — исходное сообщение.
_PYDANTIC_MESSAGES: dict[str, str] = {
    "missing": "Обязательное поле",
    "string_too_short": "Минимальная длина — {min_length}",
    "string_too_long": "Максимальная длина — {max_length}",
    "string_type": "Ожидается строка",
    "int_parsing": "Ожидается целое число",
    "int_type": "Ожидается целое число",
    "greater_than": "Должно быть больше {gt}",
    "greater_than_equal": "Должно быть не меньше {ge}",
    "less_than": "Должно быть меньше {lt}",
    "less_than_equal": "Должно быть не больше {le}",
    "json_invalid": "Некорректный JSON",
    "model_attributes_type": "Ожидается объект",
    "list_type": "Ожидается список",
}

_LOC_SOURCES = {"body", "query", "path", "header", "cookie"}


def pydantic_fields(errors: list[dict[str, Any]]) -> dict[str, str]:
    """Раскладывает ошибки Pydantic по именам полей (``offers.0.share``); на поле — первая ошибка."""
    fields: dict[str, str] = {}
    for err in errors:
        loc = [str(part) for part in err.get("loc", ())]
        if loc and loc[0] in _LOC_SOURCES:
            loc = loc[1:]
        name = ".".join(loc) or "body"
        template = _PYDANTIC_MESSAGES.get(err.get("type", ""))
        try:
            text = template.format(**(err.get("ctx") or {})) if template else err.get("msg", "")
        except (KeyError, IndexError):
            text = err.get("msg", "")
        fields.setdefault(name, text)
    return fields


async def _api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    return error_response(exc.code, exc.message, exc.fields, exc.keitaro)


async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return error_response("validation_error", VALIDATION_MESSAGE, pydantic_fields(list(exc.errors())))


async def _http_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Ошибки маршрутизации Starlette: неизвестный путь, неверный метод и т. п.

    Это не проверки формы, поэтому не ``validation_error``. 404 → ``not_found``, остальное —
    ``internal_error`` (фронт обратился к API неправильно), но с исходным HTTP-статусом (405 и т. д.).
    """
    if exc.status_code == 404:
        return error_response("not_found", "Не найдено")
    logger.error("HTTP %s на %s %s: %s", exc.status_code, request.method, request.url.path, exc.detail)
    return error_response(
        "internal_error", "Некорректный запрос к API", status_code=exc.status_code, headers=exc.headers
    )


async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Непредвиденная ошибка на %s %s", request.method, request.url.path, exc_info=exc)
    return error_response("internal_error", INTERNAL_MESSAGE)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, _http_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, _unhandled_handler)
