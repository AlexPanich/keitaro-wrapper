# Backend

FastAPI + SQLAlchemy 2.0 (async, asyncpg) + Alembic + pydantic-settings. Python 3.12 (в Docker).

## Раскладка `app/`

- `main.py` — приложение, exception handlers, монтирование фронта.
- `api/router.py` — общий роутер с префиксом `/api`; роуты в `api/routes/`, зависимости в `api/deps.py`.
- `core/config.py` — `Settings` (читает `.env` из корня репозитория).
- `core/errors.py` — единый конверт ошибок: `ApiError`, статусы по кодам, exception handlers. Сам список кодов `ErrorCode` — в `schemas/error.py`.
- `db/` — `Base`, `engine`, `get_session`.
- `models/` — ORM-модели (`Mapped[...]` / `mapped_column`).
- `schemas/` — Pydantic-схемы запросов/ответов.
- `services/keitaro/client.py` — тонкий async-клиент Keitaro Admin API (`/admin_api/v1`, заголовок `Api-Key`).
- `services/campaign_builder.py` — создаватор: проверки формы и id по Keitaro, кампания с подбором alias, гео- и оффер-поток, строка журнала, откат (`DELETE /campaigns/{id}`) при сбое после создания кампании; `services/editor.py` — редактор: поиск кампании, загрузка потоков, сверка `stream_offers` с Keitaro и черновик потока (Add / Remove / Bring back / ручная доля / снятие закрепления / «Пересчитать» / Cancel; каждое действие отвечает полным `EditorView`). Закрепление (`stream_offers.pinned`) пишется сразу и черновик не создаёт; Σ закреплённых > 100 — мгновенный отказ; `services/shares.py` — чистый пересчёт долей (правило #8).
- Черновик: `stream_drafts.offers` — активные офферы в порядке потока, `base_offers` — снимок Keitaro при создании. Черновик, совпавший с Keitaro по составу и долям, удаляется при любой сборке ответа вместе с неопубликованными строками `stream_offers` (как Cancel). Мгновенные отказы действий — `validation_error` без `fields`; оффер, которого нет в Keitaro при Add, — `fields.offer_id`.
- Расхождение Keitaro с `base_offers` (по составу и долям) — флаг `conflict` у потока в любом ответе. Черновик потока, пропавшего из Keitaro или переставшего быть `landings`, удаляется при сборке ответа с сообщением в `EditorView.notices` (имя берётся из `stream_drafts.stream_name`); строки `stream_offers` остаются. При 404 кампании черновики не трогаются.
- Публикация (`POST .../publish`, `{overwrite}`): проверка черновика (`validation_error`) → сверка с `base_offers` (`draft_conflict`, если не `overwrite`) → `PUT /streams/{id}` (сбой — ошибка Keitaro, черновик цел) → черновик удаляется, офферы `published` → повторное чтение. Сбой повторного чтения или расхождение с отправленным — не ошибки, а `PublishResult.warning` (жёлтая плашка).

## Соглашения

- Роуты тонкие: валидация через схемы, вся логика — в `services/`. Сервисы получают `AsyncSession` и `KeitaroClient` аргументами (через `Depends`), а не создают сами.
- Клиент Keitaro получаем только через `Depends(get_keitaro)` — так он закрывается и легко подменяется в тестах.
- Любая ошибка API — конверт `{code, message, fields, keitaro, keitaro_url}` (`ErrorResponse`); `keitaro_url` — ссылка на кампанию в админке, когда пользователю нужно доделать что-то руками (`create_orphaned`), иначе `null`. Свои ошибки бросай как `ApiError(code, message, fields=...)`; HTTP-статус берётся из `code`. Список кодов закрытый — новый код добавляй одновременно в `ErrorCode` (`schemas/error.py`), `HTTP_STATUS` и в union на фронте (`frontend/src/api.ts`).
- `KeitaroError` (наследник `ApiError`) бросает только клиент: `keitaro_auth` / `keitaro_error` / `keitaro_unavailable`, в `keitaro` — `{status, method, path, body}` без ключа API. Сервисы могут перехватить её и бросить свою ошибку с текстом шага. `message` всегда наш, по-русски.
- Ошибки Pydantic автоматически раскладываются в `fields`; любое непредвиденное исключение (включая `NotImplementedError` заглушек) → `internal_error` 500, traceback только в лог.
- Новые методы Keitaro добавляй в `KeitaroClient` через `_request`, не дергай `httpx` напрямую из сервисов.
- Доли офферов, которые пишет обёртка, в сумме дают 100. Но в Keitaro поток может прийти с суммой ≠ 100 — редактор показывает его как есть, не нормализует.

## Миграции

Любое изменение моделей — новая миграция Alembic:

```bash
alembic revision --autogenerate -m "описание"   # проверь сгенерированный файл руками
alembic upgrade head
```

Новые модели импортируй в `app/models/__init__.py`, иначе autogenerate их не увидит. Расхождения моделей и схемы проверяет `alembic check` (на Postgres).

Таблицы: `campaigns` (журнал создаватора, модель `Campaign`), `stream_offers` (известные офферы потока, `KnownOffer`, PK `stream_id`+`offer_id`), `stream_drafts` (черновик потока, `StreamDraft`). У таблиц редактора нет FK на `campaigns`.

## Тесты

```bash
pip install -r requirements-dev.txt
pytest
```

- pytest + anyio, async-тесты помечаются `pytestmark = pytest.mark.anyio`.
- Клиент Keitaro тестируется через `KeitaroClient(transport=httpx.MockTransport(...))` — без сети.
- Фикстура `client` в `tests/conftest.py` — `httpx.AsyncClient` поверх `ASGITransport`, `get_keitaro` подменён на `FakeKeitaro`. Данные фейка (`offers`, `campaigns`, `streams`) настраиваются в тесте через фикстуру `keitaro` — это тот же экземпляр, что получают ручки. Нужны новые методы Keitaro в тестах — добавляй их в `FakeKeitaro`.
- Хранилище в тестах — SQLite в памяти (`aiosqlite`), Postgres не нужен. Фикстура `session_factory` на каждый тест создаёт пустую базу по `Base.metadata.create_all` (не по миграциям); фикстура `client` подменяет `get_session` сессиями из неё. Подготовить данные или проверить результат — фикстура `session` (или `session_factory()` для чистой сессии). Сервисы с хранилищем в юнит-тестах вызывай с той же `session`.
- Postgres-специфичные типы в моделях объявляй с вариантом для SQLite: `ARRAY(...).with_variant(JSON(), "sqlite")` (см. `Campaign.geo`). Миграции и `alembic check` проверяются только на Postgres, руками.
