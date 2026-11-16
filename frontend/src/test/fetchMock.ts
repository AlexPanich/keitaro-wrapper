import { vi } from 'vitest';

/** JSON-ответ для мока `fetch`. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Мокает `fetch` по путям: ключ — путь без query (`/api/keitaro/groups`), значение — тело ответа
 * или функция от `URL` и `init` запроса (тело, метод). Неизвестный путь — 404 без конверта.
 */
type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

export function mockFetch(routes: Record<string, unknown | Handler>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://test');
    const route = routes[url.pathname];
    if (route === undefined) return new Response('not found', { status: 404 });
    return typeof route === 'function' ? (route as Handler)(url, init) : json(route);
  });
}
