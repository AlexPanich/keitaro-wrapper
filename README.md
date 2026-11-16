# Keitaro Wrapper

Обёртка над [Keitaro Admin API](https://admin-api.docs.keitaro.io/):

1. **Создаватор кампаний** — по названию, гео и ID оффера создаёт кампанию с доменом, группой и источником и двумя потоками:
   - поток 1: трафик из указанной страны → `https://www.google.com`;
   - поток 2: остальной трафик → выбранный оффер.
2. **Редактор кампании** — добавление и удаление офферов с пересчётом долей.

Стек: FastAPI, SQLAlchemy 2.0 (async), Alembic, PostgreSQL, фронт — Vite + React + TypeScript.

## Структура

```
backend/
  app/
    api/            # роуты FastAPI
    core/config.py  # настройки из .env
    db/             # engine, сессии, Base
    models/         # ORM-модели
    schemas/        # Pydantic-схемы
    services/
      keitaro/      # HTTP-клиент Keitaro Admin API
      campaign_builder.py
      editor.py     # редактор: поиск кампании, загрузка потоков
    main.py
  alembic/          # миграции
  tests/            # pytest
frontend/           # Vite + React + TS; сборка в dist/ раздаётся FastAPI на /
```

## Настройка

```bash
cp .env.example .env
# заполнить KEITARO_BASE_URL, KEITARO_API_KEY и ID домена/группы/источника
```

## Запуск через Docker

```bash
docker compose up --build
```

Миграции применяются автоматически при старте контейнера. Приложение доступно на http://localhost:8000, Swagger — http://localhost:8000/docs.

## Локальный запуск

```bash
docker compose up -d db

cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

alembic upgrade head
uvicorn app.main:app --reload
```

Фронт в dev-режиме (прокси `/api` → `localhost:8000`):

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # сборка в frontend/dist, её раздаёт FastAPI
```

## Тесты

```bash
cd backend && pip install -r requirements-dev.txt && pytest   # pytest + httpx, Keitaro замокан
cd frontend && npm test                                       # vitest + Testing Library
```

## Миграции

```bash
cd backend
alembic upgrade head                              # применить все
alembic downgrade -1                              # откатить последнюю
alembic revision --autogenerate -m "описание"     # создать новую по изменениям моделей
```

## API

| Метод  | Путь                                        | Описание                         |
|--------|---------------------------------------------|----------------------------------|
| GET    | `/api/health`                               | healthcheck                      |
| GET    | `/api/keitaro/offers`                       | список офферов из Keitaro        |
| GET    | `/api/campaigns`                            | кампании, созданные через сервис |
| POST   | `/api/campaigns`                            | создать кампанию                 |
| GET    | `/api/keitaro/campaigns?q=`                 | поиск кампании Keitaro (название или ID) |
| GET    | `/api/editor/campaigns/{id}`                | редактор: потоки кампании и сверка известных офферов (открытие и Fetch) |
