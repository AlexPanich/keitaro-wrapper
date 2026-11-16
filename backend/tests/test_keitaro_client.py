"""Классификация ответов Keitaro клиентом. Сеть не используется: ответы отдаёт httpx.MockTransport."""

from collections.abc import Callable

import anyio
import httpx
import pytest

from app.services.keitaro import KeitaroClient, KeitaroError
from app.services.keitaro import client as client_module
from app.services.keitaro.client import BODY_LIMIT, HTML_BODY, TIMEOUT_SECONDS, USER_AGENT

pytestmark = pytest.mark.anyio

API_KEY = "secret-key-123"


def make_client(handler: Callable[[httpx.Request], httpx.Response]) -> KeitaroClient:
    return KeitaroClient(base_url="https://k.example", api_key=API_KEY, transport=httpx.MockTransport(handler))


async def fail(handler: Callable[[httpx.Request], httpx.Response]) -> KeitaroError:
    client = make_client(handler)
    with pytest.raises(KeitaroError) as info:
        await client.list_offers()
    await client.close()
    return info.value


async def test_sends_user_agent_key_and_timeout():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=[{"id": 1, "name": "A"}])

    client = make_client(handler)
    assert await client.list_offers() == [{"id": 1, "name": "A"}]
    await client.close()

    (request,) = seen
    assert request.url == "https://k.example/admin_api/v1/offers"
    assert request.headers["User-Agent"] == USER_AGENT
    assert "python" not in request.headers["User-Agent"].lower()
    assert request.headers["Api-Key"] == API_KEY
    assert request.extensions["timeout"] == {k: TIMEOUT_SECONDS for k in ("connect", "read", "write", "pool")}


@pytest.mark.parametrize("status", [401, 403])
async def test_auth_error(status):
    err = await fail(lambda r: httpx.Response(status, json={"error": "Unauthorized"}))
    assert err.code == "keitaro_auth"
    assert err.status_code == 502
    assert "Проверьте KEITARO_API_KEY в .env" in err.message
    assert err.keitaro.status == status
    assert err.keitaro.method == "GET"
    assert err.keitaro.path == "/offers"


async def test_cloudflare_403_html_is_keitaro_error():
    err = await fail(
        lambda r: httpx.Response(
            403, text="<!DOCTYPE html><title>Error 1010</title>", headers={"content-type": "text/html"}
        )
    )
    assert err.code == "keitaro_error"
    assert err.keitaro.body == HTML_BODY


async def test_cloudflare_403_plain_text_is_keitaro_error():
    err = await fail(lambda r: httpx.Response(403, text="error code: 1010"))
    assert err.code == "keitaro_error"
    assert err.keitaro.body == "error code: 1010"


@pytest.mark.parametrize("status", [400, 404, 422, 500, 503])
async def test_http_error(status):
    err = await fail(lambda r: httpx.Response(status, json={"error": "bad"}))
    assert err.code == "keitaro_error"
    assert err.status == status
    assert err.keitaro.body == '{"error":"bad"}'


async def test_success_with_html_is_keitaro_error():
    err = await fail(lambda r: httpx.Response(200, text="<html>login</html>", headers={"content-type": "text/html"}))
    assert err.code == "keitaro_error"
    assert err.keitaro.body == HTML_BODY


async def test_success_with_non_json_is_keitaro_error():
    err = await fail(lambda r: httpx.Response(200, text="not json at all"))
    assert err.code == "keitaro_error"
    assert err.keitaro.body == "not json at all"


async def test_timeout_is_unavailable():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timeout", request=request)

    err = await fail(handler)
    assert err.code == "keitaro_unavailable"
    assert err.status_code == 504
    assert err.keitaro.status is None
    assert err.keitaro.body is None


async def test_total_timeout_covers_slow_response(monkeypatch):
    # Каждая фаза httpx укладывается в лимит, но запрос целиком — нет.
    monkeypatch.setattr(client_module, "TIMEOUT_SECONDS", 0.05)

    async def handler(request: httpx.Request) -> httpx.Response:
        await anyio.sleep(1)
        return httpx.Response(200, json=[])

    err = await fail(handler)
    assert err.code == "keitaro_unavailable"
    assert err.status is None


async def test_network_error_is_unavailable_without_retries():
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ConnectError("refused", request=request)

    err = await fail(handler)
    assert err.code == "keitaro_unavailable"
    assert calls == 1


async def test_body_is_truncated_and_key_redacted():
    body = f"key={API_KEY} " + "x" * 5000
    err = await fail(lambda r: httpx.Response(500, text=body))
    assert len(err.keitaro.body) == BODY_LIMIT
    assert API_KEY not in err.keitaro.body
    assert err.keitaro.body.startswith("key=*** ")


async def test_url_encoded_key_is_redacted():
    client = KeitaroClient(
        base_url="https://k.example",
        api_key="a/b+c",
        transport=httpx.MockTransport(lambda r: httpx.Response(500, text="key=a%2Fb%2Bc raw=a/b+c")),
    )
    with pytest.raises(KeitaroError) as info:
        await client.list_offers()
    await client.close()
    assert info.value.keitaro.body == "key=*** raw=***"


async def test_empty_success_returns_none():
    client = make_client(lambda r: httpx.Response(204))
    assert await client.get_campaign(1) is None
    await client.close()
