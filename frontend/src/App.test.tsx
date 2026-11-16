import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import App from './App';
import { mockFetch } from './test/fetchMock';

describe('App (smoke)', () => {
  it('рендерится, подтягивает справочники создаватора и переключает вкладки', async () => {
    mockFetch({
      '/api/keitaro/groups': [{ id: 1, name: 'Тестовые' }],
      '/api/keitaro/domains': [],
      '/api/keitaro/traffic_sources': [],
      '/api/keitaro/defaults': { group_id: 1, domain_id: null, traffic_source_id: null },
    });

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Keitaro Wrapper' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Тестовые' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Редактор офферов' }));
    expect(screen.getByRole('button', { name: 'Добавить оффер' })).toBeInTheDocument();
  });
});
