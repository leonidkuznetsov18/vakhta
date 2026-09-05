import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminPage } from './AdminPage.tsx';

const SITE = 'a0000000-0000-4000-8000-000000000001';
const UNIT = 'a0000000-0000-4000-8000-000000000002';
const POS = 'a0000000-0000-4000-8000-000000000004';
const EMP = 'b0000000-0000-4000-8000-000000000001';
const USER = 'u1';

const org = {
  sites: [{ id: SITE, code: 'main', name: 'Основная площадка', timezone: 'Europe/Moscow' }],
  orgUnits: [{ id: UNIT, siteId: SITE, parentId: null, name: 'Цех фасовки' }],
  teams: [],
  positions: [{ id: POS, code: 'OPERATOR', name: 'Оператор линии' }],
  zones: [],
  terminals: [],
  reasonCodes: [],
};

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function mockApi() {
  const calls: Call[] = [];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, path, body });
      if (path === '/admin/org') return json(org);
      if (path === '/admin/employees' && method === 'GET') return json([]);
      if (path === '/admin/employees' && method === 'POST') {
        return json(
          {
            id: EMP,
            personnelNumber: body.personnelNumber,
            fullName: body.fullName,
            status: 'ACTIVE',
            telegramLinked: false,
            createdAt: 'x',
          },
          201,
        );
      }
      if (path === `/admin/employees/${EMP}/activation-codes`) {
        return json(
          {
            employeeId: EMP,
            code: 'ABCD2345',
            deepLink: 'https://t.me/vakhta_worker_bot?start=act-ABCD2345',
            expiresAt: '2026-09-09T10:00:00.000Z',
          },
          201,
        );
      }
      if (path === '/admin/users' && method === 'GET') {
        return json([
          {
            id: USER,
            email: 'master@vakhta.com',
            name: 'Мастер',
            twoFactorEnabled: false,
            roles: [],
            createdAt: 'x',
          },
        ]);
      }
      if (path === `/admin/users/${USER}/roles`) {
        return json(
          {
            id: 'g1',
            role: body.role,
            scopeType: body.scopeType,
            scopeId: body.scopeId ?? null,
            grantedAt: 'x',
          },
          201,
        );
      }
      if (path === '/admin/org/terminals') {
        return json(
          {
            id: 't1',
            siteId: SITE,
            name: body.name,
            checkpoint: body.checkpoint,
            deviceToken: 'dev-token-0123456789abcdef',
          },
          201,
        );
      }
      return json({ code: 'NOT_FOUND', message: path }, 404);
    }),
  );
  return calls;
}

describe('AdminPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('створює працівника і видає код активації з посиланням', async () => {
    const calls = mockApi();
    render(<AdminPage />);
    fireEvent.change(await screen.findByLabelText('Табельный номер'), {
      target: { value: '0007' },
    });
    fireEvent.change(screen.getByLabelText('ФИО'), { target: { value: 'Петров Пётр' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить сотрудника' }));

    expect(await screen.findByText('Петров Пётр')).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST' && c.path === '/admin/employees')?.body).toEqual({
      personnelNumber: '0007',
      fullName: 'Петров Пётр',
      status: 'ACTIVE',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Код активации' }));
    expect(await screen.findByText(/Код активации: ABCD2345/)).toBeTruthy();
    expect(screen.getByText('https://t.me/vakhta_worker_bot?start=act-ABCD2345')).toBeTruthy();
  });

  it('видає роль з областю підрозділу', async () => {
    const calls = mockApi();
    render(<AdminPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Пользователи и роли' }));
    expect(await screen.findByText('master@vakhta.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Выдать роль' }));
    fireEvent.change(screen.getByLabelText('Роль'), { target: { value: 'PLANNER' } });
    fireEvent.change(screen.getByLabelText('Область'), { target: { value: 'ORG_UNIT' } });
    fireEvent.change(await screen.findByLabelText('Объект области'), { target: { value: UNIT } });
    fireEvent.click(screen.getByRole('button', { name: 'Выдать' }));

    await screen.findByText('Роль выдана.');
    expect(calls.find((c) => c.path === `/admin/users/${USER}/roles`)?.body).toEqual({
      role: 'PLANNER',
      scopeType: 'ORG_UNIT',
      scopeId: UNIT,
    });
    expect(screen.getByText('Планировщик')).toBeTruthy();
  });

  it('реєструє термінал і показує токен один раз', async () => {
    mockApi();
    render(<AdminPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Терминалы' }));
    fireEvent.change(await screen.findByLabelText('Название'), { target: { value: 'Проходная' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрировать терминал' }));
    await waitFor(() => expect(screen.getByText('dev-token-0123456789abcdef')).toBeTruthy());
    expect(screen.getByText(/показывается один раз/)).toBeTruthy();
  });
});
