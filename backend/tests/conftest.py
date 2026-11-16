from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401  — регистрирует модели в metadata
from app.api.deps import get_keitaro
from app.db.base import Base
from app.db.session import get_session
from app.main import app
from app.schemas.error import KeitaroDetails
from app.services.keitaro import KeitaroError


class FakeKeitaro:
    """Заглушка клиента Keitaro — без сетевых запросов.

    Тест подменяет данные через фикстуру `keitaro`: списки `offers`, `groups`, `domains`,
    `traffic_sources`, а также `campaigns` (`{id: кампания}`) и `streams` (`{campaign_id: [потоки]}`).
    """

    def __init__(self) -> None:
        self.offers: list[dict] = [{"id": 1, "name": "Offer A"}, {"id": 2, "name": "Offer B"}]
        self.groups: list[dict] = []
        self.domains: list[dict] = []
        self.traffic_sources: list[dict] = []
        self.campaigns: dict[int, dict] = {}
        self.streams: dict[int, list[dict]] = {}

    async def list_offers(self) -> list[dict]:
        return self.offers

    async def get_offer(self, offer_id: int) -> dict:
        for offer in self.offers:
            if offer["id"] == offer_id:
                return offer
        # Несуществующий оффер Keitaro отдаёт 404 HTML-страницей nginx.
        raise KeitaroError(
            "keitaro_error",
            "Keitaro вернул ошибку",
            KeitaroDetails(status=404, method="GET", path=f"/offers/{offer_id}", body=None),
        )

    async def list_campaigns(self) -> list[dict]:
        return list(self.campaigns.values())

    async def get_campaign(self, campaign_id: int) -> dict:
        if campaign_id not in self.campaigns:
            # Keitaro отвечает на несуществующую кампанию 404 HTML-страницей nginx.
            raise KeitaroError(
                "keitaro_error",
                "Keitaro вернул ошибку",
                KeitaroDetails(status=404, method="GET", path=f"/campaigns/{campaign_id}", body=None),
            )
        return self.campaigns[campaign_id]

    async def list_streams(self, campaign_id: int) -> list[dict]:
        return self.streams.get(campaign_id, [])

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
    """Заглушка Keitaro, которую видят ручки через фикстуру ``client``."""
    return FakeKeitaro()


@pytest.fixture
async def session_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """Хранилище на SQLite в памяти: схема из ORM-моделей, своя на каждый тест.

    `StaticPool` держит одно соединение, иначе каждая сессия видела бы пустую базу.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
async def session(session_factory) -> AsyncIterator[AsyncSession]:
    """Сессия для подготовки данных и проверок в тесте."""
    async with session_factory() as s:
        yield s


@pytest.fixture
async def client(session_factory, keitaro: FakeKeitaro) -> AsyncIterator[AsyncClient]:
    async def _get_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as s:
            yield s

    app.dependency_overrides[get_keitaro] = lambda: keitaro
    app.dependency_overrides[get_session] = _get_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
