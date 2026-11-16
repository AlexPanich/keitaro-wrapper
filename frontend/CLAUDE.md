# Frontend

Vite + React 19 + TypeScript (strict). Без роутера и стейт-менеджера — локальный `useState`.

## Раскладка `src/`

- `main.tsx` — точка входа.
- `App.tsx` — шапка, вкладки, загрузка справочника офферов.
- `api.ts` — единственное место с `fetch`: типы ответов бэка и функции `api.*`. Пути относительные (`/api/...`).
- `components/` — `CreateCampaign`, `OfferEditor`, `OfferSelect`, `ErrorBanner` (плашка ошибки операции), `FieldError` (ошибка под полем).
- `style.css` — глобальные стили, цвета через CSS-переменные в `:root`.
- `test/setup.ts` — подключение `jest-dom` и cleanup после каждого теста.

## Соглашения

- Компоненты — функциональные, `export default`, по одному на файл в `components/`.
- Новые запросы к бэку добавляй в `api.ts` с типами; компоненты не вызывают `fetch` напрямую.
- Типы в `api.ts` должны совпадать с Pydantic-схемами из `backend/app/schemas/`.
- Любой `api.*` при ошибке бросает `ApiError` (`code`, `message`, `fields`, `keitaro`). `code` — union `ErrorCode`, закрытый список с бэка (`backend/app/schemas/error.py`): новый код добавляй в обоих местах. `code === null` — конверта нет (бэк недоступен или ответил не JSON), `message` тогда «Сервис недоступен, попробуйте ещё раз».
- Ошибки операций показывай через `<ErrorBanner>` в месте действия, `fields` — текстом под полем формы. В `catch` приводи исключение через `toApiError`.
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
