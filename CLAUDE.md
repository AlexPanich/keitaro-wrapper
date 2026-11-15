# Keitaro Wrapper

Обёртка над Keitaro Admin API (https://admin-api.docs.keitaro.io/): создание кампаний с двумя потоками (гео → `FALLBACK_REDIRECT_URL`, остальной трафик → оффер) и редактор офферов кампании с пересчётом долей.

## Структура

- `backend/` — FastAPI + SQLAlchemy 2.0 (async) + Alembic + PostgreSQL. Подробности в `backend/CLAUDE.md`.
- `frontend/` — Vite + React + TypeScript. Подробности в `frontend/CLAUDE.md`.
- `docker-compose.yml` — `db` (postgres:16) + `backend`. Образ бэка собирается из корня (`backend/Dockerfile`, multi-stage: сначала собирается фронт, `dist` кладётся в `/frontend`).

## Как всё связано

- Весь API под префиксом `/api`. В проде FastAPI сам раздаёт собранный фронт (`frontend/dist`) на `/`.
- В dev фронт крутится на Vite (`:5173`) и проксирует `/api` → `localhost:8000`.
- Контракт API задаётся Pydantic-схемами в `backend/app/schemas/`; TS-типы в `frontend/src/api.ts` поддерживаются вручную. Поменял схему — обнови типы на фронте.

## Команды

```bash
cp .env.example .env                 # конфиг; .env не коммитить
docker compose up --build            # всё целиком на :8000
cd backend && pytest                 # тесты бэка
cd frontend && npm test              # тесты фронта
cd frontend && npm run build         # tsc + vite build
```

## Правила

- Перед завершением задачи прогоняй тесты той части, которую менял (а при изменении контракта API — обе).
- Тесты не ходят в реальный Keitaro и не требуют Postgres: Keitaro мокается, сеть в тестах не используется.
- Комментарии, docstring'и и README — на русском.
- Каждая задача — в отдельной ветке от `main`: `feature/<кратко>` для новой функциональности, `fix/<кратко>` для исправлений (kebab-case, например `feature/offer-editor`, `fix/share-rounding`). В `main` напрямую не коммитить.
- Коммиты — по Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:` …), scope по части проекта: `feat(backend): ...`, `test(frontend): ...`. Коммить через скил `git-commit` (`/commit`), он сам разбивает изменения на логичные коммиты.
- Секреты (`KEITARO_API_KEY` и т. п.) только через `.env`, не хардкодить.
