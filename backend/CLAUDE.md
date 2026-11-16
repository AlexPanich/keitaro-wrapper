# Backend

FastAPI + SQLAlchemy 2.0 (async, asyncpg) + Alembic + pydantic-settings. Python 3.12 (в Docker).

## Раскладка `app/`

- `main.py` — приложение, exception handlers, монтирование фронта.
- `api/router.py` — общий роутер с префиксом `/api`; роуты в `api/routes/`, зависимости в `api/deps.py`.
- `core/config.py` — `Settings` (читает `.env` из корня репозитория).
- `core/errors.py` — единый конверт ошибок: `ErrorCode`, `ApiError`, exception handlers.
- `db/` — `Base`, `engine`, `get_session`.
- `models/` — ORM-модели (`Mapped[...]` / `mapped_column`).
- `schemas/` — Pydantic-схемы запросов/ответов.
- `services/keitaro/client.py` — тонкий async-клиент Keitaro Admin API (`/admin_api/v1`, заголовок `Api-Key`).
- `services/campaign_builder.py`, `services/offer_editor.py` — бизнес-логика (пока заглушки с TODO).

## Соглашения

- Роуты тонкие: валидация через схемы, вся логика — в `services/`. Сервисы получают `AsyncSession` и `KeitaroClient` аргументами (через `Depends`), а не создают сами.
- Клиент Keitaro получаем только через `Depends(get_keitaro)` — так он закрывается и легко подменяется в тестах.
- Любая ошибка API — конверт `{code, message, fields, keitaro}` (`ErrorResponse`). Свои ошибки бросай как `ApiError(code, message, fields=...)`; HTTP-статус берётся из `code`. Список кодов закрытый — новый код добавляй одновременно в `ErrorCode` и в union на фронте (`frontend/src/api.ts`).
- `KeitaroError` (наследник `ApiError`) бросает только клиент: `keitaro_auth` / `keitaro_error` / `keitaro_unavailable`, в `keitaro` — `{status, method, path, body}` без ключа API. Сервисы могут перехватить её и бросить свою ошибку с текстом шага. `message` всегда наш, по-русски.
- Ошибки Pydantic автоматически раскладываются в `fields`; любое непредвиденное исключение (включая `NotImplementedError` заглушек) → `internal_error` 500, traceback только в лог.
- Новые методы Keitaro добавляй в `KeitaroClient` через `_request`, не дергай `httpx` напрямую из сервисов.
- Доли офферов в потоке в сумме всегда 100 (`StreamOffer.share` 0..100).

## Миграции

Любое изменение моделей — новая миграция Alembic:

```bash
alembic revision --autogenerate -m "описание"   # проверь сгенерированный файл руками
alembic upgrade head
```

Новые модели импортируй в `app/models/__init__.py`, иначе autogenerate их не увидит.

## Тесты

```bash
pip install -r requirements-dev.txt
pytest
```

- pytest + anyio, async-тесты помечаются `pytestmark = pytest.mark.anyio`.
- Клиент Keitaro тестируется через `KeitaroClient(transport=httpx.MockTransport(...))` — без сети.
- Фикстура `client` в `tests/conftest.py` — `httpx.AsyncClient` поверх `ASGITransport`, `get_keitaro` подменён на `FakeKeitaro`. Нужны новые методы Keitaro в тестах — добавляй их в `FakeKeitaro`.
- БД в тестах сейчас не поднимается; для тестов с БД переопределяй `get_session`.
