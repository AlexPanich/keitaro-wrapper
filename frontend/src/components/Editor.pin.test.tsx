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
    offers: [offer(1, 33), offer(2, 33), offer(3, 34)],
    archive: [],
    ...extra,
  };
}

function view(s: EditorStream): EditorView {
  return {
    campaign: { id: 500, name: 'Main campaign', state: 'active', keitaro_url: 'https://k.example/admin/#!/campaigns/500' },
    streams: [s],
  };
}

type Handler = (init: RequestInit | undefined) => Response;

/** Мок бэка: поиск и загрузка кампании, остальные пути — `routes` по «METHOD путь». */
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

function refusal(message: string) {
  return json({ code: 'validation_error', message, fields: {}, keitaro: null }, 422);
}

async function openCampaign() {
  render(<Editor />);
  await userEvent.type(screen.getByRole('combobox', { name: 'Кампания' }), 'main');
  await userEvent.click(await screen.findByRole('option', { name: /#500 Main campaign/ }));
  return screen.findByRole('table');
}

function shareInput(offerId: number) {
  return screen.getByRole('spinbutton', { name: `Доля «Станет» #${offerId}` });
}

function pinButton(offerId: number) {
  return screen.getByRole('button', { name: `Закрепить долю #${offerId}` });
}

/** Ответ на ручной ввод 50 у оффера 1: закреплён, остальные 25/25. */
const manual = stream({
  draft: true,
  offers: [
    offer(1, 33, { new_share: 50, pinned: true }),
    offer(2, 33, { new_share: 25 }),
    offer(3, 34, { new_share: 25 }),
  ],
});

describe('Editor: ручная доля и закрепление', () => {
  it('колонки «Станет» с полем ввода и «закрепление»', async () => {
    mockBackend(view(stream()));
    const table = await openCampaign();

    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Оффер',
      'В Keitaro',
      '→',
      'Станет',
      'закрепление',
      'убрать',
    ]);
    expect(shareInput(1)).toHaveValue(33);
    expect(pinButton(1)).toHaveAttribute('aria-pressed', 'false');
  });

  it('ввод доли и Enter — PUT, ответ показывает закрепление и пересчёт', async () => {
    const fetchMock = mockBackend(view(stream()), { [`PUT ${STREAM}/offers/1/share`]: () => json(view(manual)) });
    await openCampaign();

    await userEvent.clear(shareInput(1));
    await userEvent.type(shareInput(1), '50{Enter}');

    await vi.waitFor(() => expect(shareInput(2)).toHaveValue(25));
    const call = fetchMock.mock.calls.find(([u, i]) => u === `${STREAM}/offers/1/share` && i?.method === 'PUT');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ share: 50 });
    expect(shareInput(1)).toHaveValue(50);
    expect(pinButton(1)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Неопубликованные изменения' })).toBeInTheDocument();
  });

  it('то же значение по blur — запроса нет', async () => {
    const fetchMock = mockBackend(view(stream()));
    await openCampaign();

    await userEvent.click(shareInput(1));
    await userEvent.tab();

    expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(false);
  });

  it('не целое 0..100 — отказ всплывающим сообщением, значение возвращается', async () => {
    const fetchMock = mockBackend(view(stream()));
    await openCampaign();

    await userEvent.clear(shareInput(1));
    await userEvent.type(shareInput(1), '120{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent('Доля — целое от 0 до 100');
    expect(shareInput(1)).toHaveValue(33);
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(false);
  });

  it('Σ закреплённых > 100 — отказ бэка всплывающим сообщением, значение возвращается', async () => {
    mockBackend(view(stream()), {
      [`PUT ${STREAM}/offers/1/share`]: () => refusal('Сумма закреплённых долей станет 110, больше 100'),
    });
    await openCampaign();

    await userEvent.clear(shareInput(1));
    await userEvent.type(shareInput(1), '90{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent('Сумма закреплённых долей станет 110, больше 100');
    expect(shareInput(1)).toHaveValue(33);
  });

  it('булавка — POST pin, повторное нажатие — DELETE pin', async () => {
    const pinned = stream({ offers: [offer(1, 33, { pinned: true }), offer(2, 33), offer(3, 34)] });
    const fetchMock = mockBackend(view(stream()), {
      [`POST ${STREAM}/offers/1/pin`]: () => json(view(pinned)),
      [`DELETE ${STREAM}/offers/1/pin`]: () => json(view(stream())),
    });
    await openCampaign();

    await userEvent.click(pinButton(1));
    await vi.waitFor(() => expect(pinButton(1)).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.queryByRole('region', { name: 'Неопубликованные изменения' })).not.toBeInTheDocument();

    await userEvent.click(pinButton(1));
    await vi.waitFor(() => expect(pinButton(1)).toHaveAttribute('aria-pressed', 'false'));
    expect(fetchMock).toHaveBeenCalledWith(`${STREAM}/offers/1/pin`, expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledWith(`${STREAM}/offers/1/pin`, expect.objectContaining({ method: 'DELETE' }));
  });

  it('«Пересчитать» у предупреждения о сумме — POST recompute', async () => {
    const broken = stream({ offers: [offer(1, 50), offer(2, 30), offer(3, 30)] });
    const recomputed = stream({
      draft: true,
      offers: [offer(1, 50, { new_share: 33 }), offer(2, 30, { new_share: 33 }), offer(3, 30, { new_share: 34 })],
    });
    const fetchMock = mockBackend(view(broken), { [`POST ${STREAM}/recompute`]: () => json(view(recomputed)) });
    await openCampaign();

    const warning = screen.getByRole('alert');
    expect(warning).toHaveTextContent('Сумма долей в Keitaro — 110, а не 100');
    await userEvent.click(within(warning).getByRole('button', { name: 'Пересчитать' }));

    expect(await screen.findByRole('region', { name: 'Неопубликованные изменения' })).toHaveTextContent('Σ 100%');
    expect(fetchMock).toHaveBeenCalledWith(`${STREAM}/recompute`, expect.objectContaining({ method: 'POST' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('все офферы закреплены и сумма ≠ 100 — предупреждение', async () => {
    const allPinned = stream({
      draft: true,
      offers: [offer(1, 50, { new_share: 60, pinned: true }), offer(2, 50, { new_share: 30, pinned: true })],
    });
    mockBackend(view(allPinned));
    await openCampaign();

    expect(screen.getByRole('alert')).toHaveTextContent('Все офферы закреплены, сумма ≠ 100 — публикация заблокирована');
  });

  it('все закреплены, но сумма 100 — предупреждения нет', async () => {
    mockBackend(view(stream({ offers: [offer(1, 50, { pinned: true }), offer(2, 50, { pinned: true })] })));
    await openCampaign();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
