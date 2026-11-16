"""Раздача собранного фронта не должна перехватывать ответы `/api`."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app

pytestmark = pytest.mark.anyio


@pytest.fixture
async def front_client(tmp_path):
    (tmp_path / "index.html").write_text("<html>spa</html>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    app = create_app(frontend_dir=tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_index_and_assets_are_served(front_client):
    index = await front_client.get("/")
    assert index.status_code == 200
    assert "spa" in index.text

    asset = await front_client.get("/assets/app.js")
    assert asset.status_code == 200
    assert "console.log" in asset.text


async def test_wrong_api_method_keeps_allow_header_with_frontend(front_client):
    res = await front_client.delete("/api/campaigns")
    assert res.status_code == 405
    assert "allow" in res.headers
    assert res.json()["code"] == "internal_error"


async def test_unknown_api_path_is_not_found_envelope_with_frontend(front_client):
    res = await front_client.get("/api/no-such-route")
    assert res.status_code == 404
    assert res.json()["code"] == "not_found"


async def test_without_frontend_dir_root_is_not_found(tmp_path):
    app = create_app(frontend_dir=tmp_path / "missing")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.get("/")
    assert res.status_code == 404
