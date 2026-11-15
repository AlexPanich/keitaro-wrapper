# Frontend

Vite + React 19 + TypeScript (strict). Без роутера и стейт-менеджера — локальный `useState`.

## Раскладка `src/`

- `main.tsx` — точка входа.
- `App.tsx` — шапка, вкладки, загрузка справочника офферов.
- `api.ts` — единственное место с `fetch`: типы ответов бэка и функции `api.*`. Пути относительные (`/api/...`).
- `components/` — `CreateCampaign`, `OfferEditor`, `OfferSelect`.
- `style.css` — глобальные стили, цвета через CSS-переменные в `:root`.
- `test/setup.ts` — подключение `jest-dom` и cleanup после каждого теста.

## Соглашения

- Компоненты — функциональные, `export default`, по одному на файл в `components/`.
- Новые запросы к бэку добавляй в `api.ts` с типами; компоненты не вызывают `fetch` напрямую.
- Типы в `api.ts` должны совпадать с Pydantic-схемами из `backend/app/schemas/`.
- Без `any`; `tsc -b` должен проходить (`noUnusedLocals`/`noUnusedParameters` включены).

## Команды

```bash
npm install
npm run dev        # :5173, /api проксируется на localhost:8000
npm run build      # tsc -b && vite build → dist/
npm run typecheck
npm test           # vitest run
```

## Тесты

- Vitest + jsdom + Testing Library (`@testing-library/react`, `user-event`, `jest-dom`). Конфиг — секция `test` в `vite.config.ts`.
- Файлы `*.test.tsx` рядом с кодом.
- Сеть мокается через `vi.spyOn(globalThis, 'fetch')`; моки сбрасываются в `setup.ts`.
- Ищи элементы по ролям и тексту (`getByRole`, `findByRole`), а не по классам.
