import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { EditorOffer, EditorStream, EditorView, PublishResult } from '../api';
import { json } from '../test/fetchMock';
import Editor from './Editor';

const PUBLISH = 'POST /api/editor/campaigns/500/streams/12/publish';

function offer(offer_id: number, share: number | null, extra: Partial<EditorOffer> = {}): EditorOffer {
  return {
    offer_id,
    name: `Offer ${offer_id}`,
    share,
    new_share: share,
    disabled: false,
    deleted: false,
    pinned: false,
    published: true,
    ...extra,
  };
}

function stream(extra: Partial<EditorStream> = {}): EditorStream {
  return {
    id: 12,
    name: 'Offers',
    type: 'regular',
    position: 2,
    state: 'active',
    schema: 'landings',
    is_offer_stream: true,
    draft: false,
    conflict: false,
    offers: [offer(2, 50), offer(3, 50)],
    archive: [],
    ...extra,
  };
}

function view(s: EditorStream, notices: string[] = []): EditorView {
  return {
    campaign: { id: 500, name: 'Main campaign', state: 'active', keitaro_url: 'https://k.example/admin/#!/campaigns/500' },
    streams: [s],
    notices,
  };
}

/**
 * Черновик: в Keitaro 1/2/3 = 30/30/40; оффер 1 убран, 2 без изменений, 3 → 40%→35%, 4 добавлен 35%.
 */
const drafted = stream({
  draft: true,
  offers: [offer(2, 30), offer(3, 40, { new_share: 35 }), offer(4, null, { new_share: 35, published: false })],
  archive: [offer(1, 30, { new_share: null })],
});

const published = stream({ offers: [offer(2, 30), offer(3, 35), offer(4, 35)], archive: [offer(1, null)] });

type Handler = (init: RequestInit | undefined) => Response;

function mockBackend(loaded: EditorView, routes: Record<string, Handler> = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://test');
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    if (key === 'GET /api/keitaro/campaigns') return json([{ id: 500, name: 'Main campaign', state: 'active' }]);
    if (key === 'GET /api/editor/campaigns/500') return json(loaded);
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected ${key}`);
    return handler(init);
  });
}

function result(v: EditorView, warning: string | null = null): Response {
  const body: PublishResult = { view: v, warning };
  return json(body);
}

function envelope(code: string, message: string, status: number): Response {
  return json({ code, message, fields: {}, keitaro: null }, status);
}

function sentBodies(fetchMock: ReturnType<typeof mockBackend>) {
  return fetchMock.mock.calls
    .filter(([u, i]) => String(u).endsWith('/publish') && i?.method === 'POST')
    .map(([, i]) => JSON.parse(String(i?.body)));
}

async function openCampaign() {
  render(<Editor />);
  await userEvent.type(screen.getByRole('combobox', { name: 'Кампания' }), 'main');
  await userEvent.click(await screen.findByRole('option', { name: /#500 Main campaign/ }));
  await screen.findByRole('table');
}

async function openReview() {
  await userEvent.click(screen.getByRole('button', { name: 'Проверить и опубликовать' }));
  return screen.getByRole('dialog', { name: 'Проверка изменений' });
}

describe('Editor: публикация черновика', () => {
  it('окно показывает дифф; «Опубликовать» отправляет черновик, точка потока зелёная', async () => {
    const fetchMock = mockBackend(view(drafted), { [PUBLISH]: () => result(view(published)) });
    await openCampaign();

    const dialog = await openReview();

    expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/#2 Offer 2.*без изменений.*30%/),
      expect.stringMatching(/#3 Offer 3.*изменится: 40% → 35%/),
      expect.stringMatching(/#4 Offer 4.*\+ добавится.*35%/),
      expect.stringMatching(/#1 Offer 1.*− уберётся: 30% → архив/),
    ]);
    expect(within(dialog).getByRole('button', { name: 'Назад' })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Опубликовать' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sentBodies(fetchMock)).toEqual([{ overwrite: false }]);
    expect(screen.queryByRole('region', { name: 'Неопубликованные изменения' })).not.toBeInTheDocument();
    const streams = screen.getByRole('list', { name: 'Потоки' });
    expect(within(streams).getByTitle('опубликован')).toBeInTheDocument();
  });

  it('«Назад» закрывает окно без запроса', async () => {
    const fetchMock = mockBackend(view(drafted));
    await openCampaign();

    const dialog = await openReview();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Назад' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sentBodies(fetchMock)).toEqual([]);
    expect(screen.getByRole('region', { name: 'Неопубликованные изменения' })).toBeInTheDocument();
  });

  it('сумма черновика ≠ 100 — кнопка открытия окна неактивна', async () => {
    mockBackend(view(stream({ draft: true, offers: [offer(2, 50, { new_share: 60 }), offer(3, 50)] })));
    await openCampaign();

    expect(screen.getByRole('button', { name: 'Проверить и опубликовать' })).toBeDisabled();
  });

  it('конфликт: красное предупреждение и «Перезаписать Keitaro» с явным подтверждением', async () => {
    const fetchMock = mockBackend(view(drafted), {
      [PUBLISH]: (init) =>
        JSON.parse(String(init?.body)).overwrite
          ? result(view(published))
          : envelope('draft_conflict', 'Поток в Keitaro изменился после начала правок', 409),
    });
    await openCampaign();
    const dialog = await openReview();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Опубликовать' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Поток в Keitaro изменился после начала правок');
    expect(within(dialog).queryByRole('button', { name: 'Опубликовать' })).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Перезаписать Keitaro' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sentBodies(fetchMock)).toEqual([{ overwrite: false }, { overwrite: true }]);
  });

  it('конфликт при публикации — в окне текст ошибки с бэка', async () => {
    mockBackend(view(drafted), {
      [PUBLISH]: () => envelope('draft_conflict', 'Кто-то поменял поток в Keitaro', 409),
    });
    await openCampaign();
    const dialog = await openReview();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Опубликовать' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Кто-то поменял поток в Keitaro');
  });

  it('поток изменился в Keitaro — предупреждение над потоком при загрузке и сразу в окне', async () => {
    mockBackend(view({ ...drafted, conflict: true }));
    await openCampaign();

    expect(screen.getByRole('alert')).toHaveTextContent('Поток в Keitaro изменился после начала правок');

    const dialog = await openReview();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Поток в Keitaro изменился после начала правок');
    expect(within(dialog).getByRole('button', { name: 'Перезаписать Keitaro' })).toBeInTheDocument();
  });

  it('черновик в конфликте — точка потока «требует внимания», а не «черновик»', async () => {
    mockBackend(view({ ...drafted, conflict: true }));
    await openCampaign();

    const streams = screen.getByRole('list', { name: 'Потоки' });
    expect(within(streams).getByTitle('требует внимания')).toBeInTheDocument();
    expect(within(streams).queryByTitle('черновик')).not.toBeInTheDocument();
  });

  it('сбой PUT — окно не закрывается, плашка с «Повторить», черновик на месте', async () => {
    let attempt = 0;
    const fetchMock = mockBackend(view(drafted), {
      [PUBLISH]: () =>
        ++attempt === 1 ? envelope('keitaro_unavailable', 'Keitaro не ответил', 504) : result(view(published)),
    });
    await openCampaign();
    const dialog = await openReview();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Опубликовать' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Keitaro не ответил');
    expect(screen.getByRole('region', { name: 'Неопубликованные изменения' })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Повторить' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sentBodies(fetchMock)).toEqual([{ overwrite: false }, { overwrite: false }]);
  });

  it.each([
    'Опубликовано, но не удалось перечитать поток — нажмите Fetch',
    'Keitaro сохранил поток не так, как отправлено',
  ])('предупреждение после публикации — жёлтой плашкой: %s', async (warning) => {
    mockBackend(view(drafted), { [PUBLISH]: () => result(view(published), warning) });
    await openCampaign();
    const dialog = await openReview();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Опубликовать' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(warning);
  });

  it('сообщения уровня кампании — над правой частью', async () => {
    mockBackend(view(stream(), ['Поток «Old» удалён в Keitaro, неопубликованные правки потеряны']));
    await openCampaign();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Поток «Old» удалён в Keitaro, неопубликованные правки потеряны',
    );
  });
});
