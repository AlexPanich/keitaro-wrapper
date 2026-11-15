from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_keitaro
from app.main import app


class FakeKeitaro:
    """Заглушка клиента Keitaro — без сетевых запросов."""

    async def list_offers(self) -> list[dict]:
        return [{"id": 1, "name": "Offer A"}, {"id": 2, "name": "Offer B"}]

    async def close(self) -> None:
        pass


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    app.dependency_overrides[get_keitaro] = lambda: FakeKeitaro()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
