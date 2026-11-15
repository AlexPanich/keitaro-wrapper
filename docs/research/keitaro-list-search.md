# Поиск офферов и кампаний по имени в Keitaro Admin API

Research-тикет #6 (карта #4). Дата замеров: 2026-11-15.

## Вопрос

Поддерживает ли Keitaro Admin API фильтрацию, поиск и пагинацию для списков офферов, кампаний, доменов, групп и источников? Сколько записей сейчас в тестовом Keitaro и сколько весит ответ? Где фильтровать: на стороне Keitaro или на нашем бэке?

## Ответ коротко

- **Поиска по имени в API нет ни у одного списка.** Из всех списков только `GET /campaigns` умеет пагинацию (`offset`/`limit`). `GET /groups` принимает лишь обязательный `type`. `GET /offers`, `/domains` и `/traffic_sources` параметров не принимают. POST-эндпоинтов вида «поиск офферов с фильтрами» нет.
- `POST /report/build` умеет фильтровать по имени (`CONTAINS`, `MATCH_REGEXP`…), но это отчёт по статистике: в него попадают только сущности, у которых были клики. Как поиск по справочнику он не годится.
- Данных мало: 173 **оффера** (~156 КБ, ~0,5–1,5 с), 56 **кампаний** (~33 КБ, ~0,5–1,7 с), 7 **групп** офферов и 8 групп кампаний. **Доменов** и **источников** API этим ключом отдаёт 0.
- **Вывод:** тянем полный список и фильтруем по `q` на нашем бэке (подстрока в `name` без учёта регистра, плюс совпадение по `id`). Кэш справочников в БД вне скоупа карты и не нужен. Если поиск по мере ввода покажется медленным, хватит короткого TTL-кэша в памяти процесса (30–60 с) для `/offers`. Для MVP можно обойтись без кэша.

## Документация (OpenAPI)

Источник: https://admin-api.docs.keitaro.io/. Это Redoc поверх `https://admin-api.docs.keitaro.io/openapi.json` (`info.version: v1`). Ниже параметры GET-списков в точности так, как они описаны в спеке:

| Эндпоинт | Параметры в спеке | Описание |
|---|---|---|
| `GET /offers` | нет | «Returns list of the offers» |
| `GET /campaigns` | `offset` (query, int): «The number of campaigns to skip…», `limit` (query, int): «The numbers of campaigns to return.» | «Returns the campaigns» |
| `GET /domains` | нет | «Returns list of the domains» |
| `GET /groups` | `type` (query, **required**, enum `campaigns`/`offers`/`landings`/`domains`, default `campaigns`) | «Returns list of the groups» |
| `GET /traffic_sources` | нет | «Returns list of traffic sources» |

Других путей для чтения списков в спеке нет, есть только `GET /<entity>/{id}` и `GET /<entity>/deleted` (архив). Поисковых и фильтрующих эндпоинтов вроде `/offers/search` или `/campaigns/filter` тоже нет.

`POST /report/build` (`ReportsRequest`: `range`, `dimensions`, `measures`, `filters[]`, `sort[]`) принимает `FilterRequest {name, operator, expression}` с операторами `EQUALS`, `NOT_EQUAL`, `MATCH_REGEXP`, `BEGINS_WITH`, `ENDS_WITH`, `CONTAINS`, `NOT_CONTAIN`, `IN_LIST` и др. (таблица операторов есть в описании эндпоинта в спеке). Это построитель отчёта по кликам, а не выборка из справочника.

## Проверка на живом API (только GET и read-only отчёт)

Base `https://tlgk.host/admin_api/v1`, заголовок `Api-Key`.

### Параметры списков

| Запрос | Результат |
|---|---|
| `GET /offers?limit=5`, `?offset=10&limit=5`, `?per_page=5&page=2`, `?name=…`, `?search=…`, `?filter[name]=…`, `?group_id=978` | Все параметры игнорируются: каждый раз 173 записи, 159 605 байт |
| `GET /campaigns?limit=5` | 5 записей (3 013 байт) |
| `GET /campaigns?offset=10&limit=5` | 5 записей, другие id: пагинация работает |
| `GET /campaigns?offset=0&limit=1000` | 56 записей. Общего количества нет ни в теле, ни в спеке |
| `GET /campaigns?state=disabled`, `?name=test` | Параметры игнорируются: 56 записей |

### `POST /report/build` как поиск

- `dimensions: [offer_id, offer]`, фильтр `offer CONTAINS "Miaflow"`, `interval: all_time` вернул `rows: [], total: 0`. Группы офферов «BE Miaflow RO/HU/CZ/HR» при этом существуют.
- `dimensions: [campaign_id, campaign]`, фильтр `campaign CONTAINS "test"` вернул лишь несколько кампаний с `clicks > 0`, хотя в `GET /campaigns` все 56 имён содержат `test`.

Вывод: отчёт видит только сущности с трафиком, поэтому для поиска по справочнику он не подходит.

### Объёмы и время ответа

| Список | Записей | Размер | Время |
|---|---|---|---|
| `GET /offers` | 173 | 159 605 Б (~920 Б/запись) | 0,5–1,5 с |
| `GET /campaigns` | 56 | 33 870 Б (~600 Б/запись) | 0,4–1,7 с |
| `GET /groups?type=offers` | 7 | 467 Б | ~0,4 с |
| `GET /groups?type=campaigns` | 8 | 616 Б | ~0,4 с |
| `GET /domains` | 0 | `[]` | ~0,4 с |
| `GET /traffic_sources` | 0 | `[]` | ~0,4 с |
| `GET /offers/{id}` | 1 | ~0,9 КБ | ~0,5 с |
| `GET /campaigns/deleted` | 160 | 106 КБ | ~11 с (для сравнения) |

Время включает сетевую задержку до `tlgk.host`. Разброс между прогонами примерно трёхкратный.

### Поля

**Оффер** (`GET /offers`): `id`, `name`, `group_id`, `group` (имя группы строкой), `state`, `country` (массив названий стран), `offer_type`, `action_type`, `action_payload`, `action_options`, `affiliate_network_id`, `affiliate_network`, `payout_*`, `conversion_cap_enabled`, `daily_cap`, `conversion_timezone`, `alternative_offer_id`, `local_path`, `notes`, `values`, `created_at`, `updated_at`.

Сейчас у всех 173 офферов `state: active` и `offer_type: local`. 171 из них лежит в группе 1474 «JO Flexacil PE». Имена длинные (до 132 символов), а `id` повторяется в начале имени (`"25327 Flexacil [JOINT-PE-JO_0062] …"`). Для селекта хватит `id`, `name`, `group_id`/`group` и `state`; остальное бэк может отбрасывать.

**Кампания** (`GET /campaigns`): `id`, `alias`, `name`, `type` (`position`/`weight`), `state` (`active`/`disabled`; в спеке есть ещё `deleted`), `group_id`, `group`, `domain_id`, `domain`, `traffic_source_id`, `position`, `token`, `cookies_ttl`, `bind_visitors`, `uniqueness_*`, `cost_*`, `traffic_loss`, `bypass_cache`, `parameters`, `postbacks`, `notes`, `created_at`, `updated_at`. Сейчас у всех 56 кампаний `domain_id: null` и `traffic_source_id: 0`.

**Группа**: `id`, `name`, `position`, `type`.

## Попутные находки

- **Cloudflare перед `tlgk.host` режет некоторые User-Agent.** На `Python-urllib/…` приходит `403` с телом `error code: 1010`. С `curl/…` и `python-httpx/…` всё работает. Наш клиент (`backend/app/services/keitaro/client.py`) использует httpx, так что он не затронут. Но если в тестах или скриптах появится urllib или requests с нестандартным UA, ошибка будет выглядеть как проблема с ключом, хотя дело в UA.
- **Доменов и источников этим ключом не видно.** `GET /domains` и `GET /traffic_sources` возвращают `[]`, `GET /domains/deleted` тоже пуст, у всех кампаний `domain_id: null` и `traffic_source_id: 0`. Из карты следует, что домен и источник — «обязательные селекты из API». Значит, при пустом списке в тестовом Keitaro селект будет пустым, и создаватору нужен понятный путь для этого случая: дефолт из `.env`, «без домена/источника» или ошибка. Права ключа я не проверял, решение нужно принять на карте.

## Рекомендация для спеки

1. Бэк отдаёт `GET /api/offers?q=` и `GET /api/campaigns?q=`. Внутри он один раз тянет полный список из Keitaro и фильтрует сам: регистронезависимая подстрока по `name` плюс точное совпадение по `id`, если `q` — число. Наружу уходит урезанная проекция (`id`, `name`, `group`, `state`).
2. Пагинацию `campaigns` (`offset`/`limit`) не использовать: общего количества она не отдаёт, а фильтр всё равно на нашей стороне, так что выгоды нет.
3. Кэш в БД не делать: он вне скоупа, а данных мало. Если понадобится, добавить TTL-кэш в памяти на 30–60 с и сбрасывать его после собственных изменений кампаний. Справочники (группы, домены, источники) маленькие, их можно запрашивать при каждом открытии формы.

## Источники

- Keitaro Admin API docs: https://admin-api.docs.keitaro.io/ и спека `https://admin-api.docs.keitaro.io/openapi.json` (пути `/offers`, `/campaigns`, `/domains`, `/groups`, `/traffic_sources`, `/report/build`; схемы `Offer`, `Campaign`, `ReportsRequest`, `FilterRequest`).
- Живой тестовый Keitaro `https://tlgk.host/admin_api/v1`, read-only запросы 2026-11-15.
