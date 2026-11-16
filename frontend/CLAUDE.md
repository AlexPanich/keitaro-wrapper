# Frontend

Vite + React 19 + TypeScript (strict). Без роутера и стейт-менеджера — локальный `useState`.

## Раскладка `src/`

- `main.tsx` — точка входа.
- `App.tsx` — шапка и вкладки.
- `api.ts` — единственное место с `fetch`: типы ответов бэка и функции `api.*`. Пути относительные (`/api/...`).
- `components/` — `CreateCampaign`, `OfferSearch` (общий поиск оффера по названию или ID), `DictionarySelect` (селект группы/домена/источника с «не выбрано»), `ErrorBanner` (плашка ошибки операции), `FieldError` (ошибка под полем); редактор — `Editor` (мастер-деталь) из `CampaignSearch`, `StreamList`, `StreamDetail`, `ShareBar`, `OffersTable` («В Keitaro → Станет»), `AddOffer`, `DraftBar` (панель черновика с «Проверить и опубликовать», неактивна при невалидном черновике), `ReviewDialog` (окно публикации с диффом, «Перезаписать Keitaro» при конфликте, `ErrorBanner` с «Повторить» при 502/504), `OfferTags`, `CampaignState`, `Tag`; `Toast` — всплывающее сообщение (`role="status"`) о мгновенном отказе действия.
- `editor.ts` — чистые правила отображения редактора (подписи потоков и офферов, суммы долей Keitaro и черновика, статус-точка потока).
- Действия с черновиком (`api.addOffer` и др.) отвечают полным `EditorView` — `Editor` просто заменяет им состояние. Отказ `validation_error` без `fields` — тостом, с `fields` — под полем, остальные ошибки — `ErrorBanner`. Публикация (`api.publishDraft`) отвечает `PublishResult`: ошибки показывает окно, `warning` — жёлтая плашка над потоком; `EditorView.notices` — жёлтые сообщения уровня кампании, `EditorStream.conflict` — предупреждение над потоком.
- `style.css` — глобальные стили, цвета через CSS-переменные в `:root`.
- `test/setup.ts` — подключение `jest-dom` и cleanup после каждого теста; `test/fetchMock.ts` — мок `fetch` по путям (`mockFetch`, `json`).

## Соглашения

- Компоненты — функциональные, `export default`, по одному на файл в `components/`.
- Новые запросы к бэку добавляй в `api.ts` с типами; компоненты не вызывают `fetch` напрямую.
- Типы в `api.ts` должны совпадать с Pydantic-схемами из `backend/app/schemas/`.
- Любой `api.*` при ошибке бросает `ApiError` (`code`, `message`, `fields`, `keitaro`, `keitaroUrl`); `<ErrorBanner>` сам показывает ссылку «Открыть в Keitaro», если есть `keitaroUrl`. `code` — union `ErrorCode`, закрытый список с бэка (`backend/app/schemas/error.py`): новый код добавляй в обоих местах. `code === null` — конверта нет (бэк недоступен или ответил не JSON), `message` тогда «Сервис недоступен, попробуйте ещё раз».
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
