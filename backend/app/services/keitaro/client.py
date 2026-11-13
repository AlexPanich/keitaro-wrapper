"""Тонкий асинхронный клиент Keitaro Admin API v1.

Документация: https://admin-api.docs.keitaro.io/
"""

from typing import Any

import httpx

from app.core.config import settings


class KeitaroError(Exception):
    def __init__(self, status_code: int, detail: Any):
        super().__init__(f"Keitaro API error {status_code}: {detail}")
        self.status_code = status_code
        self.detail = detail


class KeitaroClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None):
        self._http = httpx.AsyncClient(
            base_url=f"{(base_url or settings.keitaro_base_url).rstrip('/')}/admin_api/v1",
            headers={"Api-Key": api_key or settings.keitaro_api_key},
            timeout=settings.keitaro_timeout,
        )

    async def close(self) -> None:
        await self._http.aclose()

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = await self._http.request(method, path, **kwargs)
        if response.is_error:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text
            raise KeitaroError(response.status_code, detail)
        return response.json() if response.content else None

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
