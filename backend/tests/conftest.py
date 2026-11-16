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
from app.services.keitaro.client import HTML_BODY, KeitaroError


class FakeKeitaro:
    """Заглушка клиента Keitaro — без сетевых запросов.

    Тест подменяет данные через фикстуру `keitaro`: списки `offers`, `groups`, `domains`,
    `traffic_sources`, а также `campaigns` (`{id: кампания}`) и `streams` (`{campaign_id: [потоки]}`).

    Каждый вызов пишется в ``calls`` как ``(метод, аргумент)`` — по нему тест проверяет,
    что ушло в Keitaro. Ответы ``create_campaign`` и ``create_stream`` можно подменить
    очередями ``campaign_responses`` / ``stream_responses`` (исключение в очереди бросается).
    ``delete_error`` — исключение, которым падает ``delete_campaign`` (неудачная компенсация).

    ``update_stream`` сохраняет офферы в ``streams``. Очередь ``update_responses`` подменяет
    исход: исключение бросается, список ``[{offer_id, share}]`` — то, что Keitaro сохранит вместо
    отправленного. Очередь ``list_streams_responses`` подменяет ответы ``list_streams``:
    исключение бросается, ``None`` — обычный ответ из ``streams``.
    """

    def __init__(self) -> None:
        self.offers: list[dict] = [{"id": 1, "name": "Offer A"}, {"id": 2, "name": "Offer B"}]
        self.groups: list[dict] = []
        self.domains: list[dict] = []
        self.traffic_sources: list[dict] = []
        self.campaigns: dict[int, dict] = {}
        self.streams: dict[int, list[dict]] = {}
        self.calls: list[tuple[str, object]] = []
        self.campaign_responses: list[dict | Exception] = []
        self.stream_responses: list[dict | Exception] = []
        self.delete_error: Exception | None = None
        self.update_responses: list[list[dict] | Exception] = []
        self.list_streams_responses: list[Exception | None] = []
        self._next_id = 100

    def _id(self) -> int:
        self._next_id += 1
        return self._next_id

    def writes(self) -> list[tuple[str, object]]:
        """Изменяющие вызовы (всё, кроме чтения)."""
        return [c for c in self.calls if not c[0].startswith(("list_", "get_"))]

    async def list_offers(self) -> list[dict]:
        self.calls.append(("list_offers", None))
        return self.offers

    async def get_offer(self, offer_id: int) -> dict:
        self.calls.append(("get_offer", offer_id))
        for o in self.offers:
            if o["id"] == offer_id:
                return o
        raise KeitaroError(
            "keitaro_error",
            "Keitaro вернул ошибку",
            KeitaroDetails(status=404, method="GET", path=f"/offers/{offer_id}", body=HTML_BODY),
        )

    @staticmethod
    def _queued(queue: list[dict | Exception]) -> dict | None:
        if not queue:
            return None
        response = queue.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    async def create_campaign(self, payload: dict) -> dict:
        self.calls.append(("create_campaign", payload))
        return self._queued(self.campaign_responses) or {"id": self._id(), **payload, "state": "active"}

    async def create_stream(self, payload: dict) -> dict:
        self.calls.append(("create_stream", payload))
        return self._queued(self.stream_responses) or {"id": self._id(), **payload}

    async def delete_campaign(self, campaign_id: int) -> None:
        self.calls.append(("delete_campaign", campaign_id))
        if self.delete_error is not None:
            raise self.delete_error
        self.campaigns.pop(campaign_id, None)

    async def list_campaigns(self) -> list[dict]:
        self.calls.append(("list_campaigns", None))
        return list(self.campaigns.values())

    async def get_campaign(self, campaign_id: int) -> dict:
        self.calls.append(("get_campaign", campaign_id))
        if campaign_id not in self.campaigns:
            # Keitaro отвечает на несуществующую кампанию 404 HTML-страницей nginx.
            raise KeitaroError(
                "keitaro_error",
                "Keitaro вернул ошибку",
                KeitaroDetails(status=404, method="GET", path=f"/campaigns/{campaign_id}", body=None),
            )
        return self.campaigns[campaign_id]

    async def list_streams(self, campaign_id: int) -> list[dict]:
        self.calls.append(("list_streams", campaign_id))
        if self.list_streams_responses:
            response = self.list_streams_responses.pop(0)
            if isinstance(response, Exception):
                raise response
        return self.streams.get(campaign_id, [])

    async def update_stream(self, stream_id: int, payload: dict) -> dict:
        self.calls.append(("update_stream", (stream_id, payload)))
        saved = payload["offers"]
        if self.update_responses:
            response = self.update_responses.pop(0)
            if isinstance(response, Exception):
                raise response
            saved = response
        for streams in self.streams.values():
            for s in streams:
                if s["id"] == stream_id:
                    # Keitaro отвечает связями поток–оффер со своими id и состоянием.
                    s["offers"] = [
                        {"id": 9000 + o["offer_id"], "stream_id": stream_id, "offer_id": o["offer_id"],
                         "share": o["share"], "state": "active"}
                        for o in saved
                    ]
                    return s
        raise KeitaroError(
            "keitaro_error",
            "Keitaro вернул ошибку",
            KeitaroDetails(status=404, method="PUT", path=f"/streams/{stream_id}", body=None),
        )

    async def list_groups(self, group_type: str = "campaigns") -> list[dict]:
        self.calls.append(("list_groups", group_type))
        assert group_type == "campaigns"
        return self.groups

    async def list_domains(self) -> list[dict]:
        self.calls.append(("list_domains", None))
        return self.domains

    async def list_traffic_sources(self) -> list[dict]:
        self.calls.append(("list_traffic_sources", None))
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
