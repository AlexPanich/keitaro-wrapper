# Keitaro Wrapper

Обёртка над [Keitaro Admin API](https://admin-api.docs.keitaro.io/):

1. **Создаватор кампаний** — по названию, гео и ID оффера создаёт кампанию с доменом, группой и источником и двумя потоками:
   - поток 1: трафик из указанной страны → `https://www.google.com`;
   - поток 2: остальной трафик → выбранный оффер.
2. **Редактор кампании** — добавление и удаление офферов с пересчётом долей.

Стек: FastAPI, SQLAlchemy 2.0 (async), Alembic, PostgreSQL, фронт — HTML + vanilla JS.

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
      offer_editor.py
    main.py
  alembic/          # миграции
frontend/           # статический UI (раздаётся FastAPI на /)
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
| GET    | `/api/campaigns/{keitaro_id}/offers`        | офферы кампании                  |
| POST   | `/api/campaigns/{keitaro_id}/offers`        | добавить оффер                   |
| DELETE | `/api/campaigns/{keitaro_id}/offers/{id}`   | удалить оффер                    |
