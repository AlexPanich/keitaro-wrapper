export interface OfferShort {
  id: number;
  name: string;
}

export interface StreamOffer {
  offer_id: number;
  name: string | null;
  share: number;
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

export interface CampaignCreate {
  name: string;
  geo: string;
  offer_id: number;
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

  constructor(envelope: ErrorResponse | null, status: number | null) {
    super(envelope?.message ?? SERVICE_UNAVAILABLE);
    this.name = 'ApiError';
    this.code = envelope?.code ?? null;
    this.status = status;
    this.fields = envelope?.fields ?? {};
    this.keitaro = envelope?.keitaro ?? null;
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
  const { code, message, fields, keitaro } = body;
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
  return { code, message, fields: parsedFields, keitaro: parsedKeitaro };
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
  listOffers: () => request<OfferShort[]>('/keitaro/offers'),
  createCampaign: (data: CampaignCreate) =>
    request<Campaign>('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  campaignOffers: (campaignId: number) => request<StreamOffer[]>(`/campaigns/${campaignId}/offers`),
  addOffer: (campaignId: number, offerId: number) =>
    request<StreamOffer[]>(`/campaigns/${campaignId}/offers`, {
      method: 'POST',
      body: JSON.stringify({ offer_id: offerId }),
    }),
  removeOffer: (campaignId: number, offerId: number) =>
    request<StreamOffer[]>(`/campaigns/${campaignId}/offers/${offerId}`, { method: 'DELETE' }),
};
