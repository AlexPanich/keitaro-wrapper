import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { EditorOffer, EditorStream, EditorView } from '../api';
import { json } from '../test/fetchMock';
import Editor from './Editor';

const STREAM = '/api/editor/campaigns/500/streams/12';

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
    offers: [offer(1, 50), offer(2, 50)],
    archive: [],
    ...extra,
  };
}

function view(s: EditorStream): EditorView {
  return {
    campaign: { id: 500, name: 'Main campaign', state: 'active', keitaro_url: 'https://k.example/admin/#!/campaigns/500' },
    streams: [s],
    notices: [],
  };
}

/** Черновик: оффер 3 добавлен, доли 50/50 → 33/33/34. */
const drafted = stream({
  draft: true,
  offers: [
    offer(1, 50, { new_share: 33 }),
    offer(2, 50, { new_share: 33 }),
    offer(3, null, { new_share: 34, published: false }),
  ],
});

type Handler = (init: RequestInit | undefined, url: URL) => Response;

/** Мок бэка: поиск кампании, загрузка — `loaded`, остальные пути — `routes` по «METHOD путь». */
function mockBackend(loaded: EditorView, routes: Record<string, Handler> = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://test');
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    if (key === 'GET /api/keitaro/campaigns') return json([{ id: 500, name: 'Main campaign', state: 'active' }]);
    if (key === 'GET /api/editor/campaigns/500') return json(loaded);
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected ${key}`);
    return handler(init, url);
  });
}

function refusal(message: string, fields: Record<string, string> = {}) {
  return json({ code: 'validation_error', message, fields, keitaro: null }, 422);
}

async function openCampaign() {
  render(<Editor />);
  await userEvent.type(screen.getByRole('combobox', { name: 'Кампания' }), 'main');
  await userEvent.click(await screen.findByRole('option', { name: /#500 Main campaign/ }));
  return screen.findByRole('table');
}

/** Текст строки, где поле доли «Станет» заменено его значением. */
function rowText(row: HTMLElement): string {
  return Array.from(row.querySelectorAll('td'))
    .map((td) => (td.querySelector('input')?.value ?? '') + td.textContent)
    .join(' ');
}

function bodyRows(table: HTMLElement) {
  return within(table)
    .getAllByRole('row')
    .filter((r) => r.closest('tbody'));
}

describe('Editor: черновик', () => {
  it('таблица «В Keitaro → Станет»: новый оффер, итоги, жёлтая точка и панель', async () => {
    mockBackend(view(drafted));
    const table = await openCampaign();

    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Оффер',
      'В Keitaro',
      '→',
      'Станет',
      'закрепление',
      'убрать',
    ]);
    expect(bodyRows(table).map(rowText)).toEqual([
      expect.stringMatching(/#1 Offer 1.*50%.*→.*33%/),
      expect.stringMatching(/#2 Offer 2.*50%.*→.*33%/),
      expect.stringMatching(/#3 Offer 3.*новый.*—.*→.*34%/),
    ]);
    const total = within(table).getByRole('row', { name: /Итого/ });
    expect(total).toHaveTextContent(/Итого.*100%.*100%/);

    expect(screen.getByTitle('черновик')).toBeInTheDocument();
    const panel = screen.getByRole('region', { name: 'Неопубликованные изменения' });
    expect(panel).toHaveTextContent('Неопубликованные изменения · Σ 100%');
    expect(within(panel).getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
  });

  it('без черновика нет стрелок, панели и жёлтой точки', async () => {
    mockBackend(view(stream()));
    const table = await openCampaign();

    expect(bodyRows(table).map(rowText)).toEqual([
      expect.stringMatching(/#1 Offer 1.*50%.*50%/),
      expect.stringMatching(/#2 Offer 2.*50%.*50%/),
    ]);
    expect(bodyRows(table).some((r) => r.textContent?.includes('→'))).toBe(false);
    expect(screen.queryByRole('region', { name: 'Неопубликованные изменения' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('черновик')).not.toBeInTheDocument();
  });

  it('убрать — DELETE и показ ответа; убранный оффер зачёркнут со «Станет 0%»', async () => {
    const fetchMock = mockBackend(view(stream()), {
      [`DELETE ${STREAM}/offers/1`]: () =>
        json(
          view(
            stream({
              draft: true,
              offers: [offer(2, 50, { new_share: 100 })],
              archive: [offer(1, 50, { new_share: null })],
            }),
          ),
        ),
    });
    const table = await openCampaign();

    await userEvent.click(within(bodyRows(table)[0]).getByRole('button', { name: 'убрать' }));

    expect(await screen.findByRole('region', { name: 'Неопубликованные изменения' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`${STREAM}/offers/1`, expect.objectContaining({ method: 'DELETE' }));
    const rows = bodyRows(screen.getByRole('table'));
    expect(rows.map(rowText)).toEqual([
      expect.stringMatching(/#2 Offer 2.*50%.*→.*100%/),
      expect.stringMatching(/#1 Offer 1.*архив.*50%.*→.*0%/),
    ]);
    // Последний активный оффер убрать нельзя.
    expect(within(rows[0]).getByRole('button', { name: 'убрать' })).toBeDisabled();
  });

  it('Add через поиск оффера — POST с offer_id', async () => {
    const fetchMock = mockBackend(view(stream()), {
      'GET /api/keitaro/offers': () => json([{ id: 3, name: 'Offer 3', group: null, state: 'active' }]),
      [`POST ${STREAM}/offers`]: () => json(view(drafted)),
    });
    await openCampaign();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск оффера' }), '3');
    await screen.findByRole('combobox', { name: 'Найденные офферы' });
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByText('новый')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([u, i]) => u === `${STREAM}/offers` && i?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ offer_id: 3 });
  });

  it('оффера нет в Keitaro — ошибка под поиском', async () => {
    mockBackend(view(stream()), {
      'GET /api/keitaro/offers': () => json([{ id: 9, name: 'Offer 9', group: null, state: 'active' }]),
      [`POST ${STREAM}/offers`]: () =>
        refusal('Проверьте поля формы', { offer_id: 'Оффер #9 не найден в Keitaro' }),
    });
    await openCampaign();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск оффера' }), '9');
    await screen.findByRole('combobox', { name: 'Найденные офферы' });
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByText('Оффер #9 не найден в Keitaro')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('мгновенный отказ — всплывающим сообщением', async () => {
    mockBackend(view(stream()), {
      'GET /api/keitaro/offers': () => json([{ id: 1, name: 'Offer 1', group: null, state: 'active' }]),
      [`POST ${STREAM}/offers`]: () => refusal('Оффер #1 уже в потоке'),
    });
    await openCampaign();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск оффера' }), '1');
    await screen.findByRole('combobox', { name: 'Найденные офферы' });
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Оффер #1 уже в потоке');
  });

  it('вернуть из архива; удалённый в Keitaro вернуть нельзя', async () => {
    const fetchMock = mockBackend(
      view(stream({ archive: [offer(5, null), offer(88, null, { name: null, deleted: true })] })),
      {
        [`POST ${STREAM}/offers/5/bring-back`]: () =>
          json(
            view(
              stream({
                draft: true,
                offers: [offer(1, 50, { new_share: 33 }), offer(2, 50, { new_share: 33 }), offer(5, null, { new_share: 34 })],
                archive: [offer(88, null, { name: null, deleted: true })],
              }),
            ),
          ),
      },
    );
    await openCampaign();
    await userEvent.click(screen.getByRole('button', { name: /Архив \(2\)/ }));
    const list = screen.getByRole('list', { name: 'Архив' });
    const [ok, gone] = within(list).getAllByRole('listitem');
    expect(within(gone).getByRole('button', { name: 'Вернуть' })).toBeDisabled();

    await userEvent.click(within(ok).getByRole('button', { name: 'Вернуть' }));

    expect(await screen.findByRole('region', { name: 'Неопубликованные изменения' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`${STREAM}/offers/5/bring-back`, expect.objectContaining({ method: 'POST' }));
    expect(rowText(bodyRows(screen.getByRole('table'))[2])).toMatch(/#5 Offer 5.*—.*→.*34%/);
  });

  it('Отменить — DELETE черновика, панель пропадает', async () => {
    const fetchMock = mockBackend(view(drafted), { [`DELETE ${STREAM}/draft`]: () => json(view(stream())) });
    await openCampaign();

    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }));

    await vi.waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Неопубликованные изменения' })).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(`${STREAM}/draft`, expect.objectContaining({ method: 'DELETE' }));
    expect(screen.queryByText('новый')).not.toBeInTheDocument();
  });

  it('ошибка Keitaro при действии — плашкой', async () => {
    mockBackend(view(stream()), {
      [`DELETE ${STREAM}/offers/1`]: () =>
        json({ code: 'keitaro_unavailable', message: 'Keitaro не ответил', fields: {}, keitaro: null }, 504),
    });
    const table = await openCampaign();

    await userEvent.click(within(bodyRows(table)[0]).getByRole('button', { name: 'убрать' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Keitaro не ответил');
  });
});
