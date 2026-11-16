import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, SERVICE_UNAVAILABLE } from '../api';
import { json, mockFetch } from '../test/fetchMock';
import CreateCampaign from './CreateCampaign';
import ErrorBanner from './ErrorBanner';

const keitaroError = new ApiError(
  {
    code: 'keitaro_auth',
    message: 'Проверьте KEITARO_API_KEY в .env',
    fields: {},
    keitaro: { status: 401, method: 'GET', path: '/offers', body: '{"error":"Unauthorized"}' },
  },
  502,
);

describe('ErrorBanner', () => {
  it('ничего не рендерит без ошибки', () => {
    render(<ErrorBanner error={null} onClose={() => {}} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('показывает message и свёрнутые «Подробности» из keitaro', async () => {
    render(<ErrorBanner error={keitaroError} onClose={() => {}} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Проверьте KEITARO_API_KEY в .env');
    const body = screen.getByText('{"error":"Unauthorized"}');
    expect(body).not.toBeVisible();

    await userEvent.click(screen.getByText('Подробности'));
    expect(body).toBeVisible();
    expect(alert).toHaveTextContent('GET /offers');
    expect(alert).toHaveTextContent('401');
  });

  it('без keitaro «Подробностей» нет', () => {
    render(<ErrorBanner error={new ApiError(null, null)} onClose={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent(SERVICE_UNAVAILABLE);
    expect(screen.queryByText('Подробности')).not.toBeInTheDocument();
  });

  it('крестик вызывает onClose', async () => {
    const onClose = vi.fn();
    render(<ErrorBanner error={keitaroError} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('CreateCampaign: показ ошибок', () => {
  const fill = async () => {
    await userEvent.type(screen.getByRole('textbox', { name: /Название/ }), 'Test');
    await userEvent.type(screen.getByRole('textbox', { name: /Гео/ }), 'xx');
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }));
  };

  const DICTIONARIES = {
    '/api/keitaro/groups': [{ id: 1, name: 'Тестовые' }],
    '/api/keitaro/domains': [],
    '/api/keitaro/traffic_sources': [],
    '/api/keitaro/defaults': { group_id: 1, domain_id: null, traffic_source_id: null },
  };

  it('ошибки полей — под полями, плашка — с message; крестик её закрывает', async () => {
    mockFetch({
      ...DICTIONARIES,
      '/api/campaigns': () =>
        json(
          { code: 'validation_error', message: 'Проверьте поля формы', fields: { geo: 'Неизвестные коды: XX' }, keitaro: null },
          422,
        ),
    });
    render(<CreateCampaign />);
    await screen.findByRole('option', { name: 'Тестовые' });
    await fill();

    expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте поля формы');
    expect(screen.getByText('Неизвестные коды: XX')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Неизвестные коды: XX')).not.toBeInTheDocument();
  });

  it('бэк недоступен → плашка «Сервис недоступен»', async () => {
    mockFetch({
      ...DICTIONARIES,
      '/api/campaigns': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    render(<CreateCampaign />);
    await screen.findByRole('option', { name: 'Тестовые' });
    await fill();

    expect(await screen.findByRole('alert')).toHaveTextContent(SERVICE_UNAVAILABLE);
  });
});
