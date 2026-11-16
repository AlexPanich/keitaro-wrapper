import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { json, mockFetch } from '../test/fetchMock';
import OfferEditor from './OfferEditor';

describe('OfferEditor: добавление оффера', () => {
  it('добавляет оффер, найденный поиском по ID', async () => {
    const fetchMock = mockFetch({
      '/api/keitaro/offers': [{ id: 42, name: 'Miaflow RO', group: null, state: 'active' }],
      '/api/campaigns/5/offers': () => json([{ offer_id: 42, name: 'Miaflow RO', share: 100 }]),
    });
    render(<OfferEditor />);

    await userEvent.type(screen.getByRole('spinbutton', { name: 'ID кампании в Keitaro' }), '5');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск оффера' }), '42');
    await screen.findByRole('option', { name: '42 — Miaflow RO' });
    await userEvent.click(screen.getByRole('button', { name: 'Добавить оффер' }));

    expect(await screen.findByRole('cell', { name: 'Miaflow RO' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/campaigns/5/offers',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ offer_id: 42 }) }),
    );
  });

  it('не даёт добавить, пока оффер не выбран', () => {
    mockFetch({});
    render(<OfferEditor />);

    expect(screen.getByRole('button', { name: 'Добавить оффер' })).toBeDisabled();
  });
});
