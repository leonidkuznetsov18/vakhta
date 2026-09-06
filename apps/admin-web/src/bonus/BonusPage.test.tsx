import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BonusPage } from './BonusPage.tsx';

const SITE = 'a0000000-0000-4000-8000-000000000001';
const SCORE = 'c0000000-0000-4000-8000-000000000001';
const SESSION = 'd0000000-0000-4000-8000-000000000001';

const org = {
  sites: [{ id: SITE, code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' }],
  orgUnits: [],
  teams: [],
  positions: [],
  zones: [],
  terminals: [],
  reasonCodes: [
    {
      kind: 'ADJUSTMENT',
      code: 'MASTER_REVIEW',
      label: 'Проверка мастера',
      requiresComment: false,
      requiresPhoto: false,
      notifyMaster: false,
      severity: 'NORMAL',
      isActive: true,
    },
  ],
};

function score(status = 'PRELIMINARY') {
  return {
    id: SCORE,
    shiftSessionId: SESSION,
    employeeId: 'e1',
    employeeName: 'Кузнецов Леонид',
    businessDate: '2026-10-05',
    status,
    score: 93,
    earned: 65,
    applicableMax: 70,
    plannedMinutes: 720,
    ruleVersionId: 'r',
    ruleLabel: 'default',
    computedAt: 'x',
    excludedReason: null,
    criteria: [
      {
        criterion: 'SCHEDULE_START',
        section: 'SCHEDULE',
        maxPoints: 15,
        earnedPoints: 10,
        status: 'missed',
        basis: ['LATE_MINUTES:20'],
      },
      {
        criterion: 'HANDOVER_CHECKLIST',
        section: 'HANDOVER',
        maxPoints: 8,
        earnedPoints: 0,
        status: 'not_applicable',
        basis: ['NO_ZONE'],
      },
    ],
    adjustments: [],
  };
}

function period(status = 'OPEN') {
  return {
    id: status === 'CLOSED' ? 'p1' : null,
    siteId: SITE,
    month: '2026-10',
    status,
    ruleVersionId: null,
    ruleLabel: null,
    closedBy: null,
    closedAt: null,
    employees: [
      {
        employeeId: 'e1',
        employeeName: 'Кузнецов Леонид',
        personnelNumber: '0001',
        shifts: 1,
        evaluatedShifts: 1,
        pendingShifts: 0,
        sMonth: 93,
        weightSum: 1,
        baseAmount: null,
        bonusAmount: null,
        scores: [score(status === 'CLOSED' ? 'CONFIRMED' : 'PRELIMINARY')],
      },
    ],
    pendingAdjustments: [],
    serverTime: 'x',
  };
}

function mockApi(state: { status: string }) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, path: url.pathname, body });
      if (url.pathname === '/admin/org') return json(org);
      if (url.pathname === '/admin/bonus/period') return json(period(state.status));
      if (url.pathname === `/admin/bonus/scores/${SCORE}/adjust`)
        return json({
          ...score(),
          adjustments: [
            {
              id: 'a1',
              criterion: body.criterion,
              delta: body.delta,
              reasonCode: body.reasonCode,
              comment: body.comment,
              authorId: 'u',
              status: 'PENDING_SECOND',
              secondApproverId: null,
              createdAt: 'x',
            },
          ],
        });
      if (
        url.pathname.startsWith(`/admin/bonus/period/${SITE}/`) &&
        url.pathname.endsWith('/close')
      ) {
        state.status = 'CLOSED';
        return json(period('CLOSED'));
      }
      return json({ code: 'NOT_FOUND', message: url.pathname }, 404);
    }),
  );
  return calls;
}

describe('BonusPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('показує S місяця, розшифровку з підставою і відправляє коригування', async () => {
    const state = { status: 'OPEN' };
    const calls = mockApi(state);
    render(<BonusPage />);
    expect(await screen.findByText('Кузнецов Леонид')).toBeTruthy();
    expect(screen.getAllByText('93').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Расшифровка' }));
    expect((await screen.findAllByText('Начало смены вовремя')).length).toBeGreaterThan(0);
    expect(screen.getByText('LATE_MINUTES:20')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Изменение баллов'), { target: { value: '-15' } });
    fireEvent.change(screen.getByLabelText('Причина'), { target: { value: 'MASTER_REVIEW' } });
    fireEvent.change(screen.getByLabelText('Комментарий (обязательно)'), {
      target: { value: 'Незарегистрированный простой' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Корректировка' }));
    expect(await screen.findByText(/Требует второго подтверждения/)).toBeTruthy();
    expect(calls.find((c) => c.path.endsWith('/adjust'))?.body).toEqual({
      criterion: 'DISCIPLINE_SEQUENCE',
      delta: -15,
      reasonCode: 'MASTER_REVIEW',
      comment: 'Незарегистрированный простой',
    });
  });

  it('закриття періоду з підтвердженням і коментарем; після закриття є експорт і поле бази', async () => {
    const state = { status: 'OPEN' };
    const calls = mockApi(state);
    vi.stubGlobal('confirm', () => true);
    vi.stubGlobal('prompt', () => 'Октябрь закрыт');
    render(<BonusPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Закрыть период' }));
    await screen.findByText('Период закрыт.');
    expect(calls.find((c) => c.path.endsWith('/close'))?.body).toEqual({
      comment: 'Октябрь закрыт',
    });
    expect(await screen.findByRole('link', { name: 'Выгрузить CSV' })).toBeTruthy();
    expect(screen.getByLabelText('Бонусная база Кузнецов Леонид')).toBeTruthy();
  });
});
