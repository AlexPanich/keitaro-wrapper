import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { json, mockFetch } from '../test/fetchMock';
import CreateCampaign from './CreateCampaign';

const GROUPS = [
  { id: 1, name: 'Тестовые' },
  { id: 2, name: 'Боевые' },
];

function optionNames(select: HTMLElement): string[] {
  return within(select)
    .getAllByRole('option')
    .map((o) => o.textContent ?? '');
}

describe('CreateCampaign: справочники', () => {
  it('показывает селекты группы, домена и источника с предвыбором из .env', async () => {
    mockFetch({
      '/api/keitaro/groups': GROUPS,
      '/api/keitaro/domains': [{ id: 7, name: 'go.example.com' }],
      '/api/keitaro/traffic_sources': [{ id: 9, name: 'Facebook' }],
      '/api/keitaro/defaults': { group_id: 2, domain_id: 7, traffic_source_id: null },
    });
    render(<CreateCampaign />);

    const group = await screen.findByRole('combobox', { name: 'Группа' });
    await within(group).findByRole('option', { name: 'Боевые' });
    expect(group).toBeRequired();
    expect(group).toHaveDisplayValue('Боевые');

    const domain = screen.getByRole('combobox', { name: 'Домен' });
    expect(optionNames(domain)).toEqual(['не выбрано', 'go.example.com']);
    expect(domain).toHaveDisplayValue('go.example.com');

    const source = screen.getByRole('combobox', { name: 'Источник' });
    expect(optionNames(source)).toEqual(['не выбрано', 'Facebook']);
    expect(source).toHaveDisplayValue('не выбрано');

    expect(screen.queryByText(/в Keitaro нет/)).not.toBeInTheDocument();
  });

  it('при пустых справочниках оставляет только «не выбрано» и подсказку', async () => {
    mockFetch({
      '/api/keitaro/groups': GROUPS,
      '/api/keitaro/domains': [],
      '/api/keitaro/traffic_sources': [],
      '/api/keitaro/defaults': { group_id: null, domain_id: null, traffic_source_id: null },
    });
    render(<CreateCampaign />);

    expect(await screen.findByText('В Keitaro нет доменов')).toBeInTheDocument();
    expect(screen.getByText('В Keitaro нет источников')).toBeInTheDocument();
    expect(optionNames(screen.getByRole('combobox', { name: 'Домен' }))).toEqual(['не выбрано']);
    expect(optionNames(screen.getByRole('combobox', { name: 'Источник' }))).toEqual(['не выбрано']);
    // группа без дефолта не выбрана: пользователь обязан выбрать сам
    expect(screen.getByRole('combobox', { name: 'Группа' })).toHaveValue('');
  });

  it('показывает ошибку загрузки справочников плашкой', async () => {
    mockFetch({
      '/api/keitaro/groups': () =>
        new Response(JSON.stringify({ code: 'keitaro_auth', message: 'Keitaro отклонил ключ API', fields: {}, keitaro: null }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }),
      '/api/keitaro/domains': [],
      '/api/keitaro/traffic_sources': [],
      '/api/keitaro/defaults': { group_id: null, domain_id: null, traffic_source_id: null },
    });
    render(<CreateCampaign />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Keitaro отклонил ключ API');
  });

  it('содержит поиск оффера', () => {
    mockFetch({});
    render(<CreateCampaign />);

    expect(screen.getByRole('searchbox', { name: 'Поиск оффера' })).toBeInTheDocument();
  });
});

describe('CreateCampaign: создание', () => {
  const CREATED = {
    id: 1,
    keitaro_id: 101,
    name: 'wayfinder-test',
    alias: 'ab12cd34',
    geo: ['DE', 'FR'],
    initial_offer_id: 25327,
    domain_id: 7,
    group_id: 2,
    traffic_source_id: null,
    geo_stream_id: 102,
    offer_stream_id: 103,
    created_at: '2026-11-16T10:00:00Z',
    url: 'https://go.example.com/ab12cd34',
  };

  function routes(created: unknown, sent: unknown[]) {
    return {
      '/api/keitaro/groups': GROUPS,
      '/api/keitaro/domains': [{ id: 7, name: 'go.example.com' }],
      '/api/keitaro/traffic_sources': [{ id: 9, name: 'Facebook' }],
      '/api/keitaro/defaults': { group_id: 2, domain_id: 7, traffic_source_id: null },
      '/api/keitaro/offers': [{ id: 25327, name: 'Flexacil PE', group: null, state: 'active' }],
      '/api/campaigns': async (_url: URL, init?: RequestInit) => {
        sent.push(JSON.parse(String(init?.body)));
        return json(created, 201);
      },
    };
  }

  async function fillAndSubmit() {
    await within(await screen.findByRole('combobox', { name: 'Группа' })).findByRole('option', { name: 'Боевые' });
    await userEvent.type(screen.getByRole('textbox', { name: /Название/ }), 'wayfinder-test');
    await userEvent.type(screen.getByRole('textbox', { name: /Гео/ }), 'de, fr');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск оффера' }), 'Flexacil');
    await screen.findByRole('combobox', { name: 'Найденные офферы' });
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }));
  }

  it('отправляет все поля формы и показывает alias и URL', async () => {
    const sent: unknown[] = [];
    mockFetch(routes(CREATED, sent));
    render(<CreateCampaign />);

    await fillAndSubmit();

    const result = await screen.findByRole('status');
    expect(result).toHaveTextContent('Кампания создана');
    expect(result).toHaveTextContent('ab12cd34');
    expect(within(result).getByRole('link', { name: 'https://go.example.com/ab12cd34' })).toHaveAttribute(
      'href',
      'https://go.example.com/ab12cd34',
    );
    expect(sent).toEqual([
      { name: 'wayfinder-test', geo: 'de, fr', offer_id: 25327, group_id: 2, domain_id: 7, traffic_source_id: null },
    ]);
  });

  it('без домена показывает только alias', async () => {
    const sent: unknown[] = [];
    mockFetch(routes({ ...CREATED, domain_id: null, url: null }, sent));
    render(<CreateCampaign />);

    const domain = await screen.findByRole('combobox', { name: 'Домен' });
    await within(domain).findByRole('option', { name: 'go.example.com' });
    await userEvent.selectOptions(domain, 'не выбрано');
    await fillAndSubmit();

    const result = await screen.findByRole('status');
    expect(result).toHaveTextContent('ab12cd34');
    expect(within(result).queryByRole('link')).not.toBeInTheDocument();
    expect(sent).toEqual([expect.objectContaining({ domain_id: null, traffic_source_id: null })]);
  });

  it('create_orphaned → плашка со ссылкой «Открыть в Keitaro»', async () => {
    const orphaned = {
      code: 'create_orphaned',
      message: 'Кампания #101 создана частично и не удалена — удалите её в Keitaro вручную',
      fields: {},
      keitaro: { status: 422, method: 'POST', path: '/streams', body: '{"offers":["bad"]}' },
      keitaro_url: 'https://k.example/admin/#!/campaigns/101',
    };
    mockFetch({ ...routes(null, []), '/api/campaigns': () => json(orphaned, 502) });
    render(<CreateCampaign />);

    await fillAndSubmit();

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Кампания #101 создана частично и не удалена — удалите её в Keitaro вручную');
    expect(within(banner).getByRole('link', { name: 'Открыть в Keitaro' })).toHaveAttribute(
      'href',
      'https://k.example/admin/#!/campaigns/101',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
