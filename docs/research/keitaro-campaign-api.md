# Keitaro Admin API: создание кампании с двумя потоками, удаление, правка офферов

Research-тикет: AlexPanich/keitaro-wrapper#5 (карта #4). Термины — по `GLOSSARY.md`.

**Источники**

- [Docs] — официальная спецификация Keitaro Admin API v1: <https://admin-api.docs.keitaro.io/>, сам OpenAPI-файл: <https://admin-api.docs.keitaro.io/openapi.json> (Redoc грузит `./openapi.json`). Ссылки вида `[Docs: POST /streams]` указывают на операцию в этом файле.
- [Live] — живой тестовый трекер `https://tlgk.host/admin_api/v1`, проверено 2026-11-15/16 на кампаниях `wayfinder-test-*` (id 211089, 211090, 211091, 211092). Все они после проверки отправлены в архив через `DELETE` (см. раздел «Очистка»).

Во всех примерах ниже ключ заменён на `$KEITARO_API_KEY`.

## Краткий ответ

1. **Кампания:** `POST /campaigns` с `{"name", "alias", "group_id", "domain_id", "traffic_source_id"}`. Поле **`alias` обязательно** (422 `Alias is required`), хотя документация его обязательным не помечает. Alias уникален среди активных кампаний. [Live]
2. **Гео-поток:** `POST /streams` с `type: "regular"`, `schema: "redirect"`, `action_type: "http"`, `action_payload: "https://www.google.com"`, `filters: [{"name": "country", "mode": "accept", "payload": ["DE","FR","PL"]}]`. [Docs: POST /streams] + [Live]
3. **Оффер-поток:** `POST /streams` с `schema: "landings"`, `action_type: "http"`, `offers: [{"offer_id": N, "share": 100}]`. Тип — `"regular"` на позиции 2 или `"default"` (такой поток срабатывает последним, ловит всё, что не поймали остальные). [Live]
4. **Порядок:** у regular-потоков он задаётся полем `position` (1 — гео, 2 — офферы). Если `position` не указан, Keitaro ставит следующий номер сам. Default-поток всегда идёт после regular, его `position` роли не играет. [Live]
5. **Компенсация:** `DELETE /campaigns/{id}` → 200 и **массив** с кампанией в `state: "deleted"`. Это перенос в архив, а не физическое удаление. Повторный DELETE тоже даёт 200, то есть операция идемпотентна. Потоки при этом остаются `active` и доступны через `GET /streams/{id}`, но кампания из `GET /campaigns` и `GET /campaigns/{id}` пропадает (404). [Live]
6. **Чтение потоков:** `GET /campaigns/{id}/streams` возвращает массив потоков с вложенными `filters` и `offers` (`offers[].id`, `offer_id`, `share`, `state`). [Docs] + [Live]
7. **Правка офферов и долей:** `PUT /streams/{id}` с `{"offers": [...]}` **целиком заменяет** список офферов потока: каких нет в массиве, те удаляются, у оставшихся (по `offer_id`) обновляется `share`. Частичный PUT остальные поля потока не трогает. [Live]
8. **Валидации Keitaro почти нет.** Сумму долей (70+70 принято), существование оффера (`offer_id: 99999999` принят), ISO-код страны (`XX` принят), существование `domain_id`/`traffic_source_id` (999999 принят) он не проверяет. Проверяется только то, что `share` целое (422 `Share must be an integer`). Всё это обёртка должна проверять сама. [Live]
9. **Cloudflare перед API режет User-Agent `Python-urllib/*`** (403, тело `error code: 1010`). `python-httpx`, `python-requests`, `curl` и свой UA проходят. В клиенте надо явно задать UA, например `keitaro-wrapper/0.1`. [Live]
10. **С этим ключом `GET /domains` и `GET /traffic_sources` возвращают `[]`** (200), а `GET /domains/1` и `GET /traffic_sources/1` отвечают 404. Справочники домена и источника для селектов на тестовом стенде пустые, поэтому привязку к реальным домену и источнику проверить нельзя. [Live]

## 1. Справочники (только чтение)

| Запрос | Что вернул живой API |
|---|---|
| `GET /groups?type=campaigns` | 8 групп `{id, name, position, type}`, например `9799 "VZ adrobot test"` |
| `GET /groups?type=offers` | 7 групп офферов |
| `GET /offers` | 173 оффера (`id, name, group_id, state, ...`) |
| `GET /domains` | `[]` |
| `GET /traffic_sources` | `[]` |
| `GET /stream_types` | `regular`, `default`, `forced` |
| `GET /stream_schemas` | `landings`, `redirect`, `action` |
| `GET /streams_actions` | в том числе `{"key":"http","name":"HttpRedirect","field":"url","type":"redirect"}` |
| `GET /stream_filters` | в том числе `{"value":"country","modes":{"accept":"IS","reject":"IS NOT"},"group":"filters.groups.geo"}` |

Пути метаданных в документации называются `/stream_types`, `/stream_schemas`, `/streams_actions`, `/stream_filters` (обрати внимание на `streams_` и `stream_`). Варианты вроде `/streams/types` дают 404. [Docs] + [Live]

Ключ на тестовом стенде видит только часть данных: в `GET /campaigns` 56 кампаний, все тестовые (`test_*`). Похоже, у API-пользователя ограниченные права (вывод: в документации об этом нет, видно только по ответам).

Для селектов из ТЗ: группа — `GET /groups?type=campaigns`. Домен и источник — `GET /domains` и `GET /traffic_sources` [Docs], но на этом стенде они пустые. Значит, в UI надо допускать «не выбрано» (`domain_id: null`, `traffic_source_id: 0`). Все существующие тестовые кампании на стенде так и живут: `domain_id: null`, `traffic_source_id: 0`.

## 2. Создание кампании

```bash
curl -X POST "$BASE/admin_api/v1/campaigns" \
  -H "Api-Key: $KEITARO_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"wayfinder-test-1794783257-main","alias":"wayfinder-test-main-1794783257",
       "group_id":9799,"type":"position","state":"active"}'
```

Ответ 200 (не 201):

```json
{"name":"wayfinder-test-1794783257-main","alias":"wayfinder-test-main-1794783257","group_id":9799,
 "type":"position","state":"active","cost_type":"CPC","cost_currency":"USD","uniqueness_method":"ip",
 "position":9999,"token":"…","cookies_ttl":24,"bind_visitors":null,
 "created_at":"2026-11-15 22:54:17","updated_at":"2026-11-15 22:54:17","id":211090,
 "domain_id":null,"domain":null,"postbacks":[],"group":"VZ adrobot test"}
```

С привязкой к домену и источнику (поля по [Docs: POST /campaigns]):

```json
{"name":"…","alias":"…","group_id":9799,"domain_id":999999,"traffic_source_id":999999}
```

Этот запрос принят (200), в ответе `"domain_id":999999,"traffic_source_id":999999,"domain":null`: несуществующие id Keitaro сохраняет молча.

Ошибки [Live]:

- без `name` и `alias`: 422 `{"name":["Name is required"],"alias":["Alias is required"]}`;
- alias уже занят активной кампанией: 422 `{"alias":["Alias has already used"]}`;
- alias кампании из архива переиспользовать можно (создание с alias удалённой 211090 прошло: 200, id 211092).

`group_id` в документации описан как `string`, на деле принимаются и `9799`, и `"9799"`, в ответе приходит число. [Docs] против [Live]

## 3. Гео-поток

```bash
curl -X POST "$BASE/admin_api/v1/streams" -H "Api-Key: $KEITARO_API_KEY" -H "Content-Type: application/json" \
  -d '{"campaign_id":211090,"type":"regular","name":"Geo -> Google","position":1,"state":"active",
       "schema":"redirect","action_type":"http","action_payload":"https://www.google.com",
       "collect_clicks":true,
       "filters":[{"name":"country","mode":"accept","payload":["DE","FR","PL"]}]}'
```

Ответ 200:

```json
{"campaign_id":211090,"type":"regular","name":"Geo -> Google","position":1,"state":"active",
 "schema":"redirect","action_type":"http","action_payload":"https://www.google.com","collect_clicks":true,
 "filters":[{"id":2954232,"stream_id":1306684,"name":"country","mode":"accept","payload":["DE","FR","PL"],"oid":2954232}],
 "offer_selection":"before_click","created_at":"2026-11-15 22:54:20","id":1306684,
 "landings":[],"offers":[],"triggers":[]}
```

- Обязательные поля потока: `campaign_id, schema, type, name, action_type` [Docs: POST /streams]. Без `action_type`: 422 `{"action_type":["Action Type is required"]}` [Live].
- **`action_payload` нет в схеме запроса** `POST /streams` и `PUT /streams/{id}` [Docs], он встречается только в примерах. На деле поле работает и обязательно для redirect-потока [Live].
- Гео задаётся **одним** фильтром `country`, в `payload` массив ISO-кодов. Это совпадает с исходным решением карты «список стран в одном фильтре». Так же устроен поток уже существующей кампании 209916 на стенде.
- Keitaro не проверяет коды: `["XX"]` принят. Поток с `payload` в виде строки `"DE,FR"` вместо массива тоже принят и сохранён строкой. Скорее всего, такой фильтр работать не будет. Нормализовать и проверять гео (верхний регистр, справочник ISO 3166-1 alpha-2, массив) должна обёртка.

## 4. Оффер-поток

```json
POST /streams
{"campaign_id":211090,"type":"regular","name":"Offers","position":2,"state":"active",
 "schema":"landings","action_type":"http","collect_clicks":true,
 "offers":[{"offer_id":17210,"share":100,"state":"active"}]}
```

Ответ 200, `id: 1306685`, `offers: [{"id":2054400,"stream_id":1306685,"offer_id":17210,"state":"active","share":100,…}]`.

- Для `schema: "landings"` поле `action_payload` не нужно, `action_type: "http"` всё равно обязателен (так его заполняет и UI Keitaro: у потока кампании 209916 то же самое).
- Вариант с `"type":"default"` тоже работает (проверено на 211091). В `GET /campaigns/{id}/streams` default-поток идёт после regular, даже если создан первым. Для ТЗ («остальное → оффер») `default` семантически точнее, `regular` на позиции 2 без фильтров даёт тот же результат.
- `offer_id` не проверяется: несуществующий 99999999 принят.

## 5. Порядок потоков

- Regular-потоки проверяются по `position`. При создании без `position` Keitaro назначает следующий номер (поток «bad», созданный третьим без позиции, получил `position: 3`). [Live]
- У default-потока `position` в ответе тоже `1`, но выводится он после regular. Порядок между типами: forced → regular → default (вывод по названиям типов и выдаче, в спецификации это явно не описано).
- Создавать потоки лучше в порядке гео → офферы и передавать `position` явно.

## 6. Удаление кампании (компенсация)

```bash
curl -X DELETE "$BASE/admin_api/v1/campaigns/211090" -H "Api-Key: $KEITARO_API_KEY"
```

Ответ 200 — **массив**:

```json
[{"id":211090,"alias":"wayfinder-test-main-1794783257","name":"wayfinder-test-1794783257-main",
  "state":"deleted","updated_at":"2026-11-15 22:54:27", "...":"..."}]
```

- [Docs: DELETE /campaigns/{id}] называет операцию «Move campaign to archive» и обещает ответ `201` со схемой `Domain`. На деле приходит `200` и массив из одной кампании. Код ответа строго сравнивать нельзя, достаточно проверять 2xx.
- После DELETE: `GET /campaigns/{id}` → 404 (HTML от nginx), кампании нет в `GET /campaigns`, она есть в `GET /campaigns/deleted` со `state: "deleted"`. Повторный DELETE → 200 (идемпотентно, удобно для повторов компенсации).
- Потоки удалённой кампании остаются `active`: `GET /streams/{id}` и `GET /campaigns/{id}/streams` продолжают их отдавать, а в `/streams/deleted` они не попадают. Удалять потоки отдельно для компенсации не нужно: без кампании трафик на них не придёт.
- Физически удаляет только `POST /campaigns/clean_archive` [Docs], но эта операция чистит **весь** архив трекера, включая чужие кампании. Обёртке её вызывать нельзя.
- Восстановить кампанию можно через `POST /campaigns/{id}/restore` [Docs] (не проверялось).

Схема компенсации для создавателя: `POST /campaigns` → `POST /streams` (гео) → `POST /streams` (офферы). При ошибке на любом шаге после первого выполняется `DELETE /campaigns/{id}`. Alias при этом освобождается, повторная попытка с тем же alias пройдёт.

## 7. Чтение потоков и правка офферов (редактор)

`GET /campaigns/{id}/streams` → массив потоков (полный объект, как в разделе 3, плюс `comments`, `filter_or`, `weight`, `offer_selection`).

Оффер-поток в чужой кампании определяется по `schema == "landings"` и непустому `offers`. Гарантированной метки, что поток создан нашим создавателем, нет.

`PUT /streams/{id}` с одним полем `offers`. Серия на потоке 1306685 [Live]:

| Запрос `offers` | Результат в ответе |
|---|---|
| `[{17210,50},{13972,50}]` | 17210 сохранил `id: 2054400`, доля стала 50; 13972 добавлен с новым `id: 2054401` |
| `[{13972,100}]` | 17210 **удалён**, остался только 13972 (тот же `id: 2054401`) |
| `[{13972,70},{17210,70}]` | принят, сумма 140 |
| `[{99999999,100}]` | принят, все прежние офферы удалены |
| `[{13972,33.3},{17210,66.7}]` | 422 `{"share":["Share must be an integer"]}` |

Выводы:

- PUT передаёт **полное желаемое состояние** списка офферов. Сопоставление идёт по `offer_id`, передавать `offers[].id` не нужно.
- Доли — только целые числа, и сумму 100 Keitaro не проверяет. Пересчёт и округление (остаток прибавляется к какой-то доле) — задача обёртки.
- Остальные поля потока при частичном PUT сохраняются. Единственное наблюдение: `comments` из `null` превращается в `""`, `action_payload` у landings-потока — из `null` в `""`.
- PUT с `filters` тоже заменяет набор фильтров: фильтр пересоздаётся с новым `id`, старый пропадает.

## Расхождения документации и реальности

| Тема | Документация | Реальность |
|---|---|---|
| `alias` в `POST /campaigns` | не обязателен | обязателен, уникален среди активных |
| `group_id` | `string` | принимается число и строка, возвращается число |
| `action_payload` в `POST/PUT /streams` | нет в схеме | работает, нужен для redirect |
| Ответ `DELETE /campaigns/{id}` | 201, схема `Domain` | 200, массив `[Campaign]` со `state: "deleted"` |
| 404 | `NotFound` (JSON) | HTML-страница nginx `404 Not Found` |
| Ответ на создание | — | 200, а не 201 |
| Валидация `share`, `offer_id`, `country`, `domain_id` | не описана | только `share` должен быть целым, остальное не проверяется |
| Доступ по User-Agent | не описан | `Python-urllib/*` → 403 `error code: 1010` (Cloudflare) |

## Очистка

Созданные кампании: 211089, 211090, 211091, 211092. По каждой выполнен `DELETE /campaigns/{id}` → 200, `state: "deleted"`. Итоговый `GET /campaigns` не содержит ни одной кампании с префиксом `wayfinder-test-`. Офферы, группы, домены и источники не изменялись.
