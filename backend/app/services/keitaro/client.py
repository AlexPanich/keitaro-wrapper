"""Тонкий асинхронный клиент Keitaro Admin API v1.

Документация: https://admin-api.docs.keitaro.io/

Любой неудачный запрос превращается в ``KeitaroError`` с одним из кодов
``keitaro_auth`` / ``keitaro_error`` / ``keitaro_unavailable``. Сервисы могут
перехватить её и бросить свою ошибку с текстом шага, опираясь на ``status``.
"""

import json
from typing import Any
from urllib.parse import quote

import anyio
import httpx

from app.core.config import settings
from app.core.errors import ApiError, ErrorCode
from app.schemas.error import KeitaroDetails

USER_AGENT = "keitaro-wrapper/0.1"
TIMEOUT_SECONDS = 10.0
BODY_LIMIT = 1000
HTML_BODY = "HTML-страница (вероятно, Cloudflare или неверный URL)"
API_PREFIX = "/admin_api/v1"

AUTH_MESSAGE = "Keitaro отклонил ключ API. Проверьте KEITARO_API_KEY в .env"
HTTP_ERROR_MESSAGE = "Keitaro вернул ошибку"
NOT_JSON_MESSAGE = "Keitaro ответил не JSON"
TIMEOUT_MESSAGE = f"Keitaro не ответил за {TIMEOUT_SECONDS:g} секунд, попробуйте ещё раз"
NETWORK_MESSAGE = "Не удалось связаться с Keitaro, попробуйте ещё раз"


class KeitaroError(ApiError):
    """Неудачный запрос к Keitaro. Подробности — в ``keitaro`` (всегда заполнено)."""

    keitaro: KeitaroDetails

    def __init__(self, code: ErrorCode, message: str, details: KeitaroDetails):
        super().__init__(code, message, keitaro=details)

    @property
    def status(self) -> int | None:
        """HTTP-статус Keitaro или ``None``, если ответа не было."""
        return self.keitaro.status


def _is_html(response: httpx.Response) -> bool:
    content_type = response.headers.get("content-type", "")
    return "text/html" in content_type or response.text.lstrip()[:1] == "<"


def _is_json(response: httpx.Response) -> bool:
    try:
        response.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return False
    return True


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
        if not self._api_key:
            return text
        for variant in {self._api_key, quote(self._api_key, safe="")}:
            text = text.replace(variant, "***")
        return text

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

    def _fail(self, code: ErrorCode, message: str, method: str, path: str, response: httpx.Response | None) -> KeitaroError:
        return KeitaroError(code, message, self._details(method, path, response))

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        # httpx ограничивает каждую фазу запроса отдельно; fail_after — общий лимит на весь запрос.
        try:
            with anyio.fail_after(TIMEOUT_SECONDS):
                response = await self._http.request(method, path, **kwargs)
        except (TimeoutError, httpx.TimeoutException):
            raise self._fail("keitaro_unavailable", TIMEOUT_MESSAGE, method, path, None) from None
        except httpx.TransportError:
            raise self._fail("keitaro_unavailable", NETWORK_MESSAGE, method, path, None) from None

        if response.is_error:
            # 403 отвечает и Cloudflare (1010: HTML или текст «error code: 1010»), а Keitaro
            # при неверном ключе — JSON. Поэтому 403 считаем отказом по ключу только с JSON.
            if response.status_code == 401 or (response.status_code == 403 and _is_json(response)):
                raise self._fail("keitaro_auth", AUTH_MESSAGE, method, path, response)
            raise self._fail("keitaro_error", HTTP_ERROR_MESSAGE, method, path, response)

        if not response.content:
            return None
        if _is_html(response) or not _is_json(response):
            raise self._fail("keitaro_error", NOT_JSON_MESSAGE, method, path, response)
        return response.json()

    # --- справочники ---
    async def list_domains(self) -> list[dict]:
        return await self._request("GET", "/domains")

    async def list_groups(self, group_type: str = "campaigns") -> list[dict]:
        return await self._request("GET", "/groups", params={"type": group_type})

    async def list_traffic_sources(self) -> list[dict]:
        return await self._request("GET", "/traffic_sources")

    async def list_offers(self) -> list[dict]:
        return await self._request("GET", "/offers")

    async def get_offer(self, offer_id: int) -> dict:
        # Несуществующий оффер — 404 (HTML), т. е. KeitaroError со status == 404.
        return await self._request("GET", f"/offers/{offer_id}")

    # --- кампании ---
    async def list_campaigns(self) -> list[dict]:
        return await self._request("GET", "/campaigns")

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
