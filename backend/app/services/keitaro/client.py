"""Тонкий асинхронный клиент Keitaro Admin API v1.

Документация: https://admin-api.docs.keitaro.io/

Любой неудачный запрос превращается в ``KeitaroError`` с одним из кодов
``keitaro_auth`` / ``keitaro_error`` / ``keitaro_unavailable``. Сервисы могут
перехватить её и бросить свою ошибку с текстом шага, опираясь на ``status``.
"""

import json
from typing import Any

import httpx

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.schemas.error import KeitaroDetails

USER_AGENT = "keitaro-wrapper/0.1"
TIMEOUT_SECONDS = 10.0
BODY_LIMIT = 1000
HTML_BODY = "HTML-страница (вероятно, Cloudflare или неверный URL)"
API_PREFIX = "/admin_api/v1"

MESSAGES: dict[str, str] = {
    "keitaro_auth": "Keitaro отклонил ключ API. Проверьте KEITARO_API_KEY в .env",
    "keitaro_error": "Keitaro вернул ошибку",
    "keitaro_not_json": "Keitaro ответил не JSON",
    "keitaro_timeout": "Keitaro не ответил за 10 секунд, попробуйте ещё раз",
    "keitaro_network": "Не удалось связаться с Keitaro, попробуйте ещё раз",
}


class KeitaroError(ApiError):
    """Неудачный запрос к Keitaro. ``status`` — HTTP-статус Keitaro или ``None``, если ответа не было."""

    def __init__(self, code: ErrorCode, message: str, details: KeitaroDetails):
        super().__init__(code, message, keitaro=details)
        self.status = details.status
        self.details = details


def _is_html(response: httpx.Response) -> bool:
    content_type = response.headers.get("content-type", "")
    return "text/html" in content_type or response.text.lstrip()[:1] == "<"


class KeitaroClient:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._api_key = api_key or settings.keitaro_api_key
        # Повторов нет: httpx сам не ретраит, а транспорт по умолчанию создаётся с retries=0.
        self._http = httpx.AsyncClient(
            base_url=f"{(base_url or settings.keitaro_base_url).rstrip('/')}{API_PREFIX}",
            headers={"Api-Key": self._api_key, "User-Agent": USER_AGENT},
            timeout=TIMEOUT_SECONDS,
            transport=transport,
        )

    async def close(self) -> None:
        await self._http.aclose()

    def _redact(self, text: str) -> str:
        return text.replace(self._api_key, "***") if self._api_key else text

    def _details(self, method: str, path: str, response: httpx.Response | None) -> KeitaroDetails:
        body: str | None = None
        if response is not None and response.content:
            body = HTML_BODY if _is_html(response) else self._redact(response.text)[:BODY_LIMIT]
        return KeitaroDetails(
            status=response.status_code if response is not None else None,
            method=method,
            path=self._redact(path),
            body=body,
        )

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        try:
            response = await self._http.request(method, path, **kwargs)
        except httpx.TimeoutException:
            raise KeitaroError(
                "keitaro_unavailable", MESSAGES["keitaro_timeout"], self._details(method, path, None)
            ) from None
        except httpx.TransportError:
            raise KeitaroError(
                "keitaro_unavailable", MESSAGES["keitaro_network"], self._details(method, path, None)
            ) from None

        if response.is_error:
            details = self._details(method, path, response)
            # 403 с HTML — это Cloudflare (1010 и т. п.), а не отказ по ключу.
            if response.status_code == 401 or (response.status_code == 403 and not _is_html(response)):
                raise KeitaroError("keitaro_auth", MESSAGES["keitaro_auth"], details)
            raise KeitaroError("keitaro_error", MESSAGES["keitaro_error"], details)

        if not response.content:
            return None
        if _is_html(response):
            raise KeitaroError("keitaro_error", MESSAGES["keitaro_not_json"], self._details(method, path, response))
        try:
            return response.json()
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise KeitaroError(
                "keitaro_error", MESSAGES["keitaro_not_json"], self._details(method, path, response)
            ) from None

    # --- справочники ---
    async def list_domains(self) -> list[dict]:
        return await self._request("GET", "/domains")

    async def list_groups(self, group_type: str = "campaigns") -> list[dict]:
        return await self._request("GET", "/groups", params={"type": group_type})

    async def list_traffic_sources(self) -> list[dict]:
        return await self._request("GET", "/traffic_sources")

    async def list_offers(self) -> list[dict]:
        return await self._request("GET", "/offers")

    # --- кампании ---
    async def get_campaign(self, campaign_id: int) -> dict:
        return await self._request("GET", f"/campaigns/{campaign_id}")

    async def create_campaign(self, payload: dict) -> dict:
        return await self._request("POST", "/campaigns", json=payload)

    # --- потоки ---
    async def list_streams(self, campaign_id: int) -> list[dict]:
        return await self._request("GET", f"/campaigns/{campaign_id}/streams")

    async def create_stream(self, payload: dict) -> dict:
        return await self._request("POST", "/streams", json=payload)

    async def update_stream(self, stream_id: int, payload: dict) -> dict:
        return await self._request("PUT", f"/streams/{stream_id}", json=payload)
