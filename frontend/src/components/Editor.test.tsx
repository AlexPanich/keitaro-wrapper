import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { EditorOffer, EditorStream, EditorView } from '../api';
import Editor from './Editor';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

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

function stream(id: number, extra: Partial<EditorStream> = {}): EditorStream {
  return {
    id,
    name: `Stream ${id}`,
    type: 'regular',
    position: 1,
    state: 'active',
    schema: 'landings',
    is_offer_stream: true,
    draft: false,
    offers: [offer(1, 100)],
    archive: [],
    ...extra,
  };
}

function view(streams: EditorStream[]): EditorView {
  return {
    campaign: { id: 500, name: 'Main campaign', state: 'active', keitaro_url: 'https://k.example/admin/#!/campaigns/500' },
    streams,
  };
}

/** Мок бэка: поиск отдаёт одну кампанию, загрузка — очередной ответ из `loads`. */
function mockBackend(...loads: Response[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/keitaro/campaigns')) {
      return json([{ id: 500, name: 'Main campaign', state: 'active' }]);
    }
    if (url === '/api/editor/campaigns/500') {
      return loads.length > 1 ? loads.shift()! : loads[0];
    }
    throw new Error(`unexpected ${url}`);
  });
}

async function openCampaign() {
  await userEvent.type(screen.getByRole('combobox', { name: 'Кампания' }), 'main');
  await userEvent.click(await screen.findByRole('option', { name: /#500 Main campaign/ }));
}

describe('Editor', () => {
  it('ищет кампанию через бэк по введённой строке и открывает её', async () => {
    const fetchMock = mockBackend(json(view([stream(12)])));
    render(<Editor />);

    await openCampaign();

    expect(fetchMock).toHaveBeenCalledWith('/api/keitaro/campaigns?q=main', expect.anything());
    const card = await screen.findByRole('region', { name: 'Открытая кампания' });
    expect(card).toHaveTextContent('#500 Main campaign');
    expect(card).toHaveTextContent('кампания активна');
    expect(screen.getByRole('link', { name: /Открыть в Keitaro/ })).toHaveAttribute(
      'href',
      'https://k.example/admin/#!/campaigns/500',
    );
  });

  it('показывает все потоки в порядке бэка; не оффер-потоки не выбираются', async () => {
    mockBackend(
      json(
        view([
          stream(10, { name: 'Geo', schema: 'redirect', is_offer_stream: false, offers: [] }),
          stream(11, { name: 'Offers', position: 2 }),
          stream(12, { name: 'Fallback', type: 'default', offers: [offer(3, 100)] }),
        ]),
      ),
    );
    render(<Editor />);
    await openCampaign();

    const list = await screen.findByRole('list', { name: 'Потоки' });
    const items = within(list).getAllByRole('button');
    expect(items.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Geo'),
      expect.stringContaining('Offers'),
      expect.stringContaining('Fallback'),
    ]);
    expect(items[0]).toBeDisabled();
    // По умолчанию выбран первый оффер-поток.
    expect(items[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: /Offers/ })).toBeInTheDocument();
    expect(screen.getByText('stream_id 11 · обычный · позиция 2')).toBeInTheDocument();

    await userEvent.click(items[2]);
    expect(screen.getByRole('heading', { name: /Fallback/ })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: /Offer 3/ })).toBeInTheDocument();
  });

  it('выбранный поток: полоса долей со штриховкой, таблица, метки, предупреждение о сумме', async () => {
    mockBackend(
      json(
        view([
          stream(12, {
            state: 'disabled',
            offers: [offer(1, 30), offer(2, 30, { disabled: true }), offer(77, 10, { name: null, deleted: true })],
          }),
        ]),
      ),
    );
    render(<Editor />);
    await openCampaign();

    expect(await screen.findByText('поток выключен')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Сумма долей в Keitaro — 70, а не 100');
    expect(screen.getByTitle('Не распределено: 30%')).toBeInTheDocument();

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1, -1);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/#1 Offer 1.*30%/),
      expect.stringMatching(/#2 Offer 2.*выключен в Keitaro.*30%/),
      expect.stringMatching(/Оффер #77 \(удалён\).*удалён в Keitaro.*10%/),
    ]);
  });

  it('сумма 100 — без предупреждения и штриховки', async () => {
    mockBackend(json(view([stream(12, { offers: [offer(1, 60), offer(2, 40)] })])));
    render(<Editor />);
    await openCampaign();

    await screen.findByRole('table');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Не распределено/)).not.toBeInTheDocument();
  });

  it('архив свёрнут, раскрывается по клику', async () => {
    mockBackend(
      json(view([stream(12, { archive: [offer(5, null), offer(88, null, { name: null, deleted: true })] })])),
    );
    render(<Editor />);
    await openCampaign();

    const toggle = await screen.findByRole('button', { name: /Архив \(2\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('#5 Offer 5')).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.getByText('#5 Offer 5')).toBeInTheDocument();
    expect(screen.getByText('Оффер #88 (удалён)')).toBeInTheDocument();
  });

  it('кампания без оффер-потоков', async () => {
    mockBackend(json(view([stream(10, { schema: 'redirect', is_offer_stream: false, offers: [] })])));
    render(<Editor />);
    await openCampaign();

    expect(await screen.findByText('В кампании нет оффер-потоков')).toBeInTheDocument();
  });

  it('пустой оффер-поток', async () => {
    mockBackend(json(view([stream(12, { offers: [] })])));
    render(<Editor />);
    await openCampaign();

    expect(await screen.findByText('В потоке пока нет офферов. Первый добавленный получит 100%')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Fetch повторяет загрузку и показывает свежие данные', async () => {
    const fetchMock = mockBackend(
      json(view([stream(12, { offers: [offer(1, 100)] })])),
      json(view([stream(12, { offers: [offer(1, 50), offer(2, 50)] })])),
    );
    render(<Editor />);
    await openCampaign();
    await screen.findByRole('cell', { name: /Offer 1/ });

    await userEvent.click(screen.getByRole('button', { name: /Fetch/ }));

    expect(await screen.findByRole('cell', { name: /Offer 2/ })).toBeInTheDocument();
    const loads = fetchMock.mock.calls.filter(([url]) => url === '/api/editor/campaigns/500');
    expect(loads).toHaveLength(2);
  });

  it('ошибка загрузки — плашкой над правой частью', async () => {
    mockBackend(
      json(
        { code: 'not_found', message: 'Кампания #500 удалена в Keitaro', fields: {}, keitaro: null },
        404,
      ),
    );
    render(<Editor />);
    await openCampaign();

    expect(await screen.findByRole('alert')).toHaveTextContent('Кампания #500 удалена в Keitaro');
  });
});
