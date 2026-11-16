import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { mockFetch } from '../test/fetchMock';
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
