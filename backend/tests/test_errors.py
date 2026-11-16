"""Единый конверт ошибок на ручках API."""

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_keitaro
from app.main import app
from app.services.keitaro import KeitaroClient

pytestmark = pytest.mark.anyio

API_KEY = "secret-key-123"
ENVELOPE_KEYS = {"code", "message", "fields", "keitaro"}


@pytest.fixture
def keitaro_response():
    """Подменяет Keitaro реальным клиентом поверх MockTransport; тест задаёт обработчик."""
    state: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        return state["handler"](request)

    app.dependency_overrides[get_keitaro] = lambda: KeitaroClient(
        base_url="https://k.example", api_key=API_KEY, transport=httpx.MockTransport(handler)
    )
    yield lambda h: state.__setitem__("handler", h)
    app.dependency_overrides.clear()


@pytest.fixture
async def raw_client():
    # raise_app_exceptions=False: иначе ServerErrorMiddleware пробрасывает исключение в тест.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_pydantic_errors_go_to_fields(client):
    res = await client.post("/api/campaigns", json={"name": "x" * 256, "geo": 1, "group_id": "abc"})
    assert res.status_code == 422
    body = res.json()
    assert set(body) == ENVELOPE_KEYS
    assert body["code"] == "validation_error"
    assert body["message"] == "Проверьте поля формы"
    assert body["keitaro"] is None
    assert body["fields"] == {
        "name": "Максимальная длина — 255",
        "geo": "Ожидается строка",
        "group_id": "Ожидается целое число",
    }


async def test_path_param_error(client):
    res = await client.get("/api/editor/campaigns/abc")
    assert res.status_code == 422
    assert res.json()["fields"] == {"campaign_id": "Ожидается целое число"}


async def test_invalid_json_body(client):
    res = await client.post(
        "/api/campaigns", content=b"{oops", headers={"content-type": "application/json"}
    )
    assert res.status_code == 422
    assert res.json()["code"] == "validation_error"


async def test_unknown_route_is_not_found(client):
    res = await client.get("/api/nope")
    assert res.status_code == 404
    assert res.json() == {"code": "not_found", "message": "Не найдено", "fields": {}, "keitaro": None}


async def test_wrong_method_is_not_validation_error(client):
    res = await client.delete("/api/campaigns")
    assert res.status_code == 405
    assert "allow" in res.headers
    body = res.json()
    assert body["code"] == "internal_error"
    assert body["fields"] == {}


def test_error_code_is_closed_list_in_openapi():
    from app.schemas.error import ErrorResponse

    schema = ErrorResponse.model_json_schema()
    assert set(schema["properties"]["code"]["enum"]) == {
        "validation_error", "not_found", "draft_conflict", "alias_exhausted", "keitaro_error",
        "keitaro_auth", "keitaro_unavailable", "create_rolled_back", "create_orphaned", "internal_error",
    }


@pytest.mark.parametrize(
    ("handler", "status", "code"),
    [
        (lambda r: httpx.Response(401, json={"error": "no"}), 502, "keitaro_auth"),
        (lambda r: httpx.Response(500, json={"error": "boom"}), 502, "keitaro_error"),
        (lambda r: httpx.Response(200, text="<html></html>", headers={"content-type": "text/html"}), 502, "keitaro_error"),
        (lambda r: (_ for _ in ()).throw(httpx.ConnectTimeout("t", request=r)), 504, "keitaro_unavailable"),
        (lambda r: (_ for _ in ()).throw(httpx.ConnectError("x", request=r)), 504, "keitaro_unavailable"),
    ],
)
async def test_keitaro_failures_in_envelope(raw_client, keitaro_response, handler, status, code):
    keitaro_response(handler)
    res = await raw_client.get("/api/keitaro/offers")
    assert res.status_code == status
    body = res.json()
    assert set(body) == ENVELOPE_KEYS
    assert body["code"] == code
    assert body["fields"] == {}
    assert body["keitaro"]["method"] == "GET"
    assert body["keitaro"]["path"] == "/offers"
    assert API_KEY not in res.text


class _BrokenKeitaro:
    async def list_offers(self) -> list[dict]:
        raise NotImplementedError

    async def close(self) -> None:
        pass


async def test_unexpected_exception_is_internal_error(raw_client, caplog):
    # NotImplementedError изнутри ручки — непредвиденная ошибка.
    app.dependency_overrides[get_keitaro] = lambda: _BrokenKeitaro()
    try:
        res = await raw_client.get("/api/keitaro/offers")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 500
    assert res.json() == {
        "code": "internal_error",
        "message": "Внутренняя ошибка сервиса",
        "fields": {},
        "keitaro": None,
    }
    assert "Traceback" not in res.text
    assert "NotImplementedError" in caplog.text
