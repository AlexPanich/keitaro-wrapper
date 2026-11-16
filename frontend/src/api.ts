/** Оффер из справочника Keitaro (урезанная проекция поиска). */
export interface OfferShort {
  id: number;
  name: string;
  group: string | null;
  state: string | null;
}

/** Пункт справочника Keitaro: группа, домен или источник. */
export interface DictionaryItem {
  id: number;
  name: string;
}

/** Предвыбор селектов создаватора из `.env`; `null` — предвыбора нет. */
export interface Defaults {
  group_id: number | null;
  domain_id: number | null;
  traffic_source_id: number | null;
}

export interface Campaign {
  id: number;
  keitaro_id: number;
  name: string;
  alias: string | null;
  /** ISO-коды стран гео-потока. */
  geo: string[];
  initial_offer_id: number;
  domain_id: number | null;
  group_id: number | null;
  traffic_source_id: number | null;
  geo_stream_id: number;
  offer_stream_id: number;
  created_at: string;
}

// --- Редактор (`backend/app/schemas/editor.py`) ---

/** Кампания Keitaro в результатах поиска. */
export interface CampaignShort {
  id: number;
  name: string;
  /** `active` / `disabled`. */
  state: string;
}

export interface EditorCampaign {
  id: number;
  name: string;
  state: string;
  /** Ссылка «Открыть в Keitaro». */
  keitaro_url: string;
}

/** Строка оффера в оффер-потоке (активная или архивная). */
export interface EditorOffer {
  offer_id: number;
  /** `null` — оффера нет в Keitaro («удалён в Keitaro»). */
  name: string | null;
  /** Доля в Keitaro; `null` — оффера нет в потоке Keitaro. Сумма может быть ≠ 100. */
  share: number | null;
  /** Доля «Станет»: из черновика, без черновика — как в Keitaro; у архивного — `null`. */
  new_share: number | null;
  disabled: boolean;
  deleted: boolean;
  pinned: boolean;
  /** `false` — добавлен в черновике и ещё не публиковался («новый»). */
  published: boolean;
}

export type StreamType = 'forced' | 'regular' | 'default';

export interface EditorStream {
  id: number;
  name: string;
  type: StreamType | string;
  position: number | null;
  state: string;
  schema: string;
  is_offer_stream: boolean;
  /** Есть черновик: `offers` и `archive` показывают его состав. */
  draft: boolean;
  /** Поток в Keitaro изменился после начала правок (не совпадает со снимком черновика). */
  conflict: boolean;
  /** Активные офферы в порядке потока (черновика, если он есть). */
  offers: EditorOffer[];
  archive: EditorOffer[];
}

/** Состояние кампании в редакторе; потоки — в порядке проверки Keitaro. */
export interface EditorView {
  campaign: EditorCampaign;
  streams: EditorStream[];
  /** Сообщения уровня кампании (например, поток с черновиком удалён в Keitaro). */
  notices: string[];
}

/** Итог публикации черновика; `warning` — жёлтая плашка, если что-то не так после PUT. */
export interface PublishResult {
  view: EditorView;
  warning: string | null;
}

/** Форма создаватора; нормализует и проверяет её бэк. */
export interface CampaignCreate {
  name: string;
  /** ISO-коды стран через запятую, регистр и пробелы не важны. */
  geo: string;
  /** `null` — оффер не выбран (бэк вернёт ошибку поля). */
  offer_id: number | null;
  group_id: number;
  /** `null` — домен не выбран. */
  domain_id: number | null;
  /** `null` — источник не выбран. */
  traffic_source_id: number | null;
}

/** Результат создаватора: строка журнала и URL кампании, если выбран домен. */
export interface CampaignCreated extends Campaign {
  url: string | null;
}

/**
 * Закрытый список кодов ошибок бэка (`backend/app/schemas/error.py`, решение в #15).
 * Новый код добавляется только вместе с обновлением этого списка.
 */
const ERROR_CODES = [
  'validation_error',
  'not_found',
  'draft_conflict',
  'alias_exhausted',
  'keitaro_error',
  'keitaro_auth',
  'keitaro_unavailable',
  'create_rolled_back',
  'create_orphaned',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

export interface KeitaroDetails {
  status: number | null;
  method: string;
  path: string;
  body: string | null;
}

/** Единый конверт ошибки API. */
export interface ErrorResponse {
  code: ErrorCode;
  message: string;
  fields: Record<string, string>;
  keitaro: KeitaroDetails | null;
  /** Ссылка на кампанию в админке Keitaro, если пользователю нужно доделать что-то там руками (`create_orphaned`). */
  keitaro_url: string | null;
}

export const SERVICE_UNAVAILABLE = 'Сервис недоступен, попробуйте ещё раз';

/**
 * Ошибка запроса к бэку. `code === null` — конверта нет: бэк недоступен или ответил не JSON.
 */
export class ApiError extends Error {
  readonly code: ErrorCode | null;
  readonly status: number | null;
  readonly fields: Record<string, string>;
  readonly keitaro: KeitaroDetails | null;
  readonly keitaroUrl: string | null;

  constructor(envelope: ErrorResponse | null, status: number | null) {
    super(envelope?.message ?? SERVICE_UNAVAILABLE);
    this.name = 'ApiError';
    this.code = envelope?.code ?? null;
    this.status = status;
    this.fields = envelope?.fields ?? {};
    this.keitaro = envelope?.keitaro ?? null;
    this.keitaroUrl = envelope?.keitaro_url ?? null;
  }
}

/** Приводит любое пойманное исключение к `ApiError` (непредвиденное — к «Сервис недоступен»). */
export function toApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(null, null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Разбирает тело ответа как конверт; `null`, если это не он. */
export function parseErrorResponse(body: unknown): ErrorResponse | null {
  if (!isRecord(body)) return null;
  const { code, message, fields, keitaro, keitaro_url } = body;
  if (!isErrorCode(code)) return null;
  if (typeof message !== 'string') return null;
  const parsedFields: Record<string, string> = {};
  if (isRecord(fields)) {
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === 'string') parsedFields[key] = value;
    }
  }
  let parsedKeitaro: KeitaroDetails | null = null;
  if (isRecord(keitaro)) {
    parsedKeitaro = {
      status: typeof keitaro.status === 'number' ? keitaro.status : null,
      method: String(keitaro.method ?? ''),
      path: String(keitaro.path ?? ''),
      body: typeof keitaro.body === 'string' ? keitaro.body : null,
    };
  }
  return {
    code,
    message,
    fields: parsedFields,
    keitaro: parsedKeitaro,
    keitaro_url: typeof keitaro_url === 'string' ? keitaro_url : null,
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new ApiError(null, null);
  }
  if (res.status === 204) return null as T;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(null, res.status);
  }
  if (!res.ok) {
    throw new ApiError(parseErrorResponse(body), res.status);
  }
  return body as T;
}

export const api = {
  searchOffers: (q: string) => request<OfferShort[]>(`/keitaro/offers?q=${encodeURIComponent(q)}`),
  listGroups: () => request<DictionaryItem[]>('/keitaro/groups'),
  listDomains: () => request<DictionaryItem[]>('/keitaro/domains'),
  listTrafficSources: () => request<DictionaryItem[]>('/keitaro/traffic_sources'),
  getDefaults: () => request<Defaults>('/keitaro/defaults'),
  createCampaign: (data: CampaignCreate) =>
    request<CampaignCreated>('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  searchCampaigns: (q: string) =>
    request<CampaignShort[]>(`/keitaro/campaigns?q=${encodeURIComponent(q)}`),
  /** Открытие кампании в редакторе и Fetch — одна и та же загрузка. */
  loadEditorCampaign: (campaignId: number) => request<EditorView>(`/editor/campaigns/${campaignId}`),
  // Действия с черновиком оффер-потока; каждое отвечает полным состоянием кампании.
  addOffer: (campaignId: number, streamId: number, offerId: number) =>
    request<EditorView>(`${streamPath(campaignId, streamId)}/offers`, {
      method: 'POST',
      body: JSON.stringify({ offer_id: offerId }),
    }),
  removeOffer: (campaignId: number, streamId: number, offerId: number) =>
    request<EditorView>(`${streamPath(campaignId, streamId)}/offers/${offerId}`, { method: 'DELETE' }),
  bringBackOffer: (campaignId: number, streamId: number, offerId: number) =>
    request<EditorView>(`${streamPath(campaignId, streamId)}/offers/${offerId}/bring-back`, { method: 'POST' }),
  cancelDraft: (campaignId: number, streamId: number) =>
    request<EditorView>(`${streamPath(campaignId, streamId)}/draft`, { method: 'DELETE' }),
  /** Публикация черновика; `overwrite` — явная перезапись потока, изменившегося в Keitaro. */
  publishDraft: (campaignId: number, streamId: number, overwrite: boolean) =>
    request<PublishResult>(`${streamPath(campaignId, streamId)}/publish`, {
      method: 'POST',
      body: JSON.stringify({ overwrite }),
    }),
};

function streamPath(campaignId: number, streamId: number): string {
  return `/editor/campaigns/${campaignId}/streams/${streamId}`;
}
