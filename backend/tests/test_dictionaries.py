"""Справочники Keitaro и поиск оффера (#19)."""

import logging

import pytest

from app.core.config import settings

pytestmark = pytest.mark.anyio


def offer(id: int, name: str, **extra) -> dict:
    """Оффер в том виде, в каком его отдаёт ``GET /offers`` (с лишними полями)."""
    return {
        "id": id,
        "name": name,
        "group_id": 10,
        "group": "JO Flexacil",
        "state": "active",
        "payout_value": 5,
        "notes": "",
        **extra,
    }


async def test_offer_search_by_name_substring_ignores_case(client, keitaro):
    keitaro.offers = [offer(25327, "25327 Flexacil PE"), offer(2, "Miaflow RO"), offer(3, "flexacil HU")]

    res = await client.get("/api/keitaro/offers", params={"q": "FLEXACIL"})

    assert res.status_code == 200
    assert res.json() == [
        {"id": 25327, "name": "25327 Flexacil PE", "group": "JO Flexacil", "state": "active"},
        {"id": 3, "name": "flexacil HU", "group": "JO Flexacil", "state": "active"},
    ]


async def test_offer_search_by_id(client, keitaro):
    keitaro.offers = [offer(25327, "Flexacil PE"), offer(253, "Miaflow RO"), offer(7, "Other 253")]

    res = await client.get("/api/keitaro/offers", params={"q": " 253 "})

    # 253 — точное совпадение по id плюс подстрока «253» в названии; 25327 по id не совпадает
    assert [o["id"] for o in res.json()] == [253, 7]


async def test_offer_search_without_query_returns_all(client, keitaro):
    keitaro.offers = [offer(1, "A"), offer(2, "B")]

    res = await client.get("/api/keitaro/offers")

    assert [o["id"] for o in res.json()] == [1, 2]


@pytest.mark.parametrize(
    ("path", "attr"),
    [("groups", "groups"), ("domains", "domains"), ("traffic_sources", "traffic_sources")],
)
async def test_dictionary_returns_id_and_name(client, keitaro, path, attr):
    setattr(keitaro, attr, [{"id": 5, "name": "Первый", "position": 1}, {"id": 9, "name": "Второй"}])

    res = await client.get(f"/api/keitaro/{path}")

    assert res.status_code == 200
    assert res.json() == [{"id": 5, "name": "Первый"}, {"id": 9, "name": "Второй"}]


@pytest.mark.parametrize("path", ["groups", "domains", "traffic_sources"])
async def test_empty_dictionary_is_not_an_error(client, path):
    res = await client.get(f"/api/keitaro/{path}")

    assert res.status_code == 200
    assert res.json() == []


@pytest.fixture
def env_defaults(monkeypatch):
    """Задаёт ``KEITARO_DEFAULT_*_ID`` на время теста."""

    def apply(group: int | None, domain: int | None, source: int | None) -> None:
        monkeypatch.setattr(settings, "keitaro_default_group_id", group)
        monkeypatch.setattr(settings, "keitaro_default_domain_id", domain)
        monkeypatch.setattr(settings, "keitaro_default_traffic_source_id", source)

    return apply


async def test_defaults_returned_when_ids_exist_in_dictionaries(client, keitaro, env_defaults, caplog):
    keitaro.groups = [{"id": 3, "name": "G"}]
    keitaro.domains = [{"id": 4, "name": "d.example"}]
    keitaro.traffic_sources = [{"id": 5, "name": "S"}]
    env_defaults(3, 4, 5)

    with caplog.at_level(logging.WARNING):
        res = await client.get("/api/keitaro/defaults")

    assert res.status_code == 200
    assert res.json() == {"group_id": 3, "domain_id": 4, "traffic_source_id": 5}
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING]


async def test_unknown_defaults_ignored_with_warning(client, keitaro, env_defaults, caplog):
    keitaro.groups = [{"id": 3, "name": "G"}]
    env_defaults(99, 4, 5)  # группы 99 нет, доменов и источников нет вовсе

    with caplog.at_level(logging.WARNING):
        res = await client.get("/api/keitaro/defaults")

    assert res.json() == {"group_id": None, "domain_id": None, "traffic_source_id": None}
    warnings = " ".join(r.getMessage() for r in caplog.records if r.levelno == logging.WARNING)
    assert "KEITARO_DEFAULT_GROUP_ID=99" in warnings
    assert "KEITARO_DEFAULT_DOMAIN_ID=4" in warnings
    assert "KEITARO_DEFAULT_TRAFFIC_SOURCE_ID=5" in warnings


async def test_unset_defaults_are_null_without_warning(client, keitaro, env_defaults, caplog):
    keitaro.groups = [{"id": 3, "name": "G"}]
    env_defaults(None, None, None)

    with caplog.at_level(logging.WARNING):
        res = await client.get("/api/keitaro/defaults")

    assert res.json() == {"group_id": None, "domain_id": None, "traffic_source_id": None}
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING]
