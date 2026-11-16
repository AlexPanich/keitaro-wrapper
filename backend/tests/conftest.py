from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_keitaro
from app.main import app


class FakeKeitaro:
    """Заглушка клиента Keitaro — без сетевых запросов. Тест может подменить списки."""

    def __init__(self) -> None:
        self.offers: list[dict] = [{"id": 1, "name": "Offer A"}, {"id": 2, "name": "Offer B"}]
        self.groups: list[dict] = []
        self.domains: list[dict] = []
        self.traffic_sources: list[dict] = []

    async def list_offers(self) -> list[dict]:
        return self.offers

    async def list_groups(self, group_type: str = "campaigns") -> list[dict]:
        assert group_type == "campaigns"
        return self.groups

    async def list_domains(self) -> list[dict]:
        return self.domains

    async def list_traffic_sources(self) -> list[dict]:
        return self.traffic_sources

    async def close(self) -> None:
        pass


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def keitaro() -> FakeKeitaro:
    return FakeKeitaro()


@pytest.fixture
async def client(keitaro: FakeKeitaro) -> AsyncIterator[AsyncClient]:
    app.dependency_overrides[get_keitaro] = lambda: keitaro
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
