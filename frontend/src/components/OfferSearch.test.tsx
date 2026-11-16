import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { json, mockFetch } from '../test/fetchMock';
import OfferSearch from './OfferSearch';

const OFFERS = [
  { id: 25327, name: '25327 Flexacil PE', group: 'JO Flexacil', state: 'active' },
  { id: 3, name: 'Miaflow RO', group: 'BE Miaflow', state: 'active' },
];

/** Бэк: фильтрует OFFERS как настоящий (подстрока name без регистра или точный id). */
function searchRoute(url: URL): Response {
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  return json(OFFERS.filter((o) => o.name.toLowerCase().includes(q) || String(o.id) === q));
}

function Harness() {
  const [value, setValue] = useState('');
  return (
    <>
      <OfferSearch value={value} onChange={setValue} />
      <output aria-label="Выбранный оффер">{value}</output>
    </>
  );
}

describe('OfferSearch', () => {
  it('находит оффер по названию и выбирает первый найденный', async () => {
    const fetchMock = mockFetch({ '/api/keitaro/offers': searchRoute });
    render(<Harness />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск оффера' }), 'miaflow');

    expect(await screen.findByRole('option', { name: '3 — Miaflow RO (BE Miaflow)' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Выбранный оффер' })).toHaveTextContent('3');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/keitaro/offers?q=miaflow', expect.anything());
  });

  it('находит оффер по ID, выбор из найденного меняет значение', async () => {
    mockFetch({ '/api/keitaro/offers': (url: URL) => (url.searchParams.get('q') === '25327' ? json(OFFERS) : searchRoute(url)) });
    render(<Harness />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск оффера' }), '25327');
    const select = await screen.findByRole('combobox', { name: 'Найденные офферы' });
    await screen.findByRole('option', { name: '3 — Miaflow RO (BE Miaflow)' });
    await userEvent.selectOptions(select, '3');

    expect(screen.getByRole('status', { name: 'Выбранный оффер' })).toHaveTextContent('3');
  });

  it('пишет, что ничего не найдено, и сбрасывает выбор', async () => {
    mockFetch({ '/api/keitaro/offers': searchRoute });
    render(<Harness />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск оффера' }), 'нет такого');

    expect(await screen.findByText('Ничего не найдено')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Выбранный оффер' })).toHaveTextContent('');
  });

  it('показывает ошибку поиска плашкой', async () => {
    mockFetch({
      '/api/keitaro/offers': () =>
        json({ code: 'keitaro_unavailable', message: 'Keitaro не ответил', fields: {}, keitaro: null }, 504),
    });
    render(<Harness />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск оффера' }), 'x');

    expect(await screen.findByRole('alert')).toHaveTextContent('Keitaro не ответил');
  });
});
