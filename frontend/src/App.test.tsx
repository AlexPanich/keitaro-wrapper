import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import App from './App';

describe('App (smoke)', () => {
  it('рендерится, подтягивает офферы и переключает вкладки', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 7, name: 'Test offer' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Keitaro Wrapper' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: '7 — Test offer' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/keitaro/offers', expect.anything());

    await userEvent.click(screen.getByRole('button', { name: 'Редактор офферов' }));
    expect(screen.getByRole('button', { name: 'Добавить оффер' })).toBeInTheDocument();
  });
});
