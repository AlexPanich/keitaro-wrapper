"""Единый конверт ошибок API.

Любая ошибка ручек уходит клиенту как ``{code, message, fields, keitaro}``.
Список ``code`` закрытый (решение в #15); новый код добавляется только вместе
с union-типом ``ErrorCode`` во ``frontend/src/api.ts``.
"""

import logging
from typing import Any, Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.error import ErrorResponse, KeitaroDetails

logger = logging.getLogger(__name__)

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

HTTP_STATUS: dict[str, int] = {
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
) -> JSONResponse:
    body = ErrorResponse(code=code, message=message, fields=fields or {}, keitaro=keitaro)
    return JSONResponse(status_code=HTTP_STATUS[code], content=body.model_dump(mode="json"))


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


async def _http_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    if exc.status_code == 404:
        return error_response("not_found", "Не найдено")
    if 400 <= exc.status_code < 500:
        return error_response("validation_error", "Некорректный запрос")
    logger.error("HTTP %s: %s", exc.status_code, exc.detail)
    return error_response("internal_error", INTERNAL_MESSAGE)


async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Непредвиденная ошибка на %s %s", request.method, request.url.path, exc_info=exc)
    return error_response("internal_error", INTERNAL_MESSAGE)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, _http_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, _unhandled_handler)
