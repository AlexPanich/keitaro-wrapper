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
async def client(session_factory) -> AsyncIterator[AsyncClient]:
    async def _get_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as s:
            yield s

    app.dependency_overrides[get_keitaro] = lambda: FakeKeitaro()
    app.dependency_overrides[get_session] = _get_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
