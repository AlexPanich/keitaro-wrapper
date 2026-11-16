import { describe, expect, it, vi } from 'vitest';

import { api, ApiError, parseErrorResponse, SERVICE_UNAVAILABLE } from './api';

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function catchError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('ожидалась ошибка');
}

describe('разбор конверта ошибки', () => {
  it('раскладывает code, message, fields и keitaro', async () => {
    const keitaro = { status: 500, method: 'GET', path: '/offers', body: '{"error":"boom"}' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ code: 'keitaro_error', message: 'Keitaro вернул ошибку', fields: {}, keitaro }, 502),
    );

    const err = await catchError(api.listGroups());
    expect(err.code).toBe('keitaro_error');
    expect(err.status).toBe(502);
    expect(err.message).toBe('Keitaro вернул ошибку');
    expect(err.keitaro).toEqual(keitaro);
  });

  it('отдаёт ошибки полей', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        { code: 'validation_error', message: 'Проверьте поля формы', fields: { geo: 'Неизвестные коды: XX' }, keitaro: null },
        422,
      ),
    );

    const err = await catchError(api.createCampaign({ name: 'a', geo: 'XX', offer_id: 1 }));
    expect(err.code).toBe('validation_error');
    expect(err.fields).toEqual({ geo: 'Неизвестные коды: XX' });
    expect(err.keitaro).toBeNull();
  });

  it('бэк недоступен → «Сервис недоступен»', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    const err = await catchError(api.listGroups());
    expect(err.code).toBeNull();
    expect(err.status).toBeNull();
    expect(err.message).toBe(SERVICE_UNAVAILABLE);
  });

  it('ответ не JSON → «Сервис недоступен»', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));

    const err = await catchError(api.listGroups());
    expect(err.code).toBeNull();
    expect(err.status).toBe(502);
    expect(err.message).toBe(SERVICE_UNAVAILABLE);
  });

  it('JSON без конверта или с неизвестным кодом → «Сервис недоступен»', () => {
    expect(parseErrorResponse({ detail: 'Not Found' })).toBeNull();
    expect(parseErrorResponse({ code: 'whatever', message: 'x', fields: {}, keitaro: null })).toBeNull();
    expect(new ApiError(parseErrorResponse([1, 2]), 500).message).toBe(SERVICE_UNAVAILABLE);
  });
});
