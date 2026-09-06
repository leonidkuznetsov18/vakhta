import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BonusPage } from './BonusPage.tsx';
import { clickRowAction } from '../test-utils.ts';

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
    score: status === 'MANUAL_REVIEW' ? null : 93,
    earned: status === 'MANUAL_REVIEW' ? 40 : 65,
    applicableMax: status === 'MANUAL_REVIEW' ? 45 : 70,
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
    reviewDecision: null,
    manualScore: null,
    reviewComment: null,
    reviewedAt: null,
    reviewSuggestedScore: status === 'MANUAL_REVIEW' ? 89 : null,
    adjustments: [],
  };
}

function period(status = 'OPEN', scoreStatus = 'PRELIMINARY') {
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
        scores: [score(scoreStatus)],
      },
    ],
    pendingAdjustments: [],
    serverTime: 'x',
  };
}

function mockApi(state: { status: string; scoreStatus?: string }) {
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
      if (url.pathname === '/admin/bonus/period')
        return json(period(state.status, state.scoreStatus ?? 'PRELIMINARY'));
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
      if (url.pathname === `/admin/bonus/scores/${SCORE}/review`) {
        return json({
          ...score('PRELIMINARY'),
          score: body.score,
          reviewDecision: body.decision,
          manualScore: body.score,
        });
      }
      if (url.pathname === '/admin/bonus/adjustments/a1' && method === 'DELETE') {
        return json(score());
      }
      if (
        url.pathname.startsWith(`/admin/bonus/period/${SITE}/`) &&
        url.pathname.endsWith('/close')
      ) {
        state.status = 'CLOSED';
        return json(period('CLOSED'));
      }
      if (url.pathname === '/admin/bonus/period/p1/reopen') {
        state.status = 'OPEN';
        return json(period('OPEN'));
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

  it('shows the month S and the rating; the employee card explains the status and takes points', async () => {
    const state = { status: 'OPEN' };
    const calls = mockApi(state);
    render(<BonusPage />);
    expect((await screen.findAllByText('Кузнецов Леонид')).length).toBeGreaterThan(0);
    expect(screen.getByText('Лучшие за месяц')).toBeTruthy();
    await clickRowAction('Расшифровка');
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/Баллы посчитаны/)).toBeTruthy();
    fireEvent.click(within(sheet).getAllByRole('button', { name: 'Расшифровка' })[0]!);
    expect(await within(sheet).findByText('LATE_MINUTES:20')).toBeTruthy();
    // The card offers the two actions by name; "Take points" opens the dialog preset to a penalty.
    expect(within(sheet).getByText(/Как это работает/)).toBeTruthy();
    fireEvent.click(within(sheet).getAllByRole('button', { name: 'Снять баллы' })[0]!);
    const dialogs = await screen.findAllByRole('dialog');
    const dialog = dialogs[dialogs.length - 1]!;
    expect(
      within(dialog).getByRole('radio', { name: 'Снять (нарушение)' }).getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.change(within(dialog).getByLabelText('Сколько баллов'), { target: { value: '15' } });
    fireEvent.change(within(dialog).getByLabelText('Причина'), {
      target: { value: 'MASTER_REVIEW' },
    });
    fireEvent.change(within(dialog).getByLabelText('Комментарий (обязательно)'), {
      target: { value: 'Ушёл раньше без предупреждения' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText(/Требует второго подтверждения/)).toBeTruthy();
    expect(calls.find((c) => c.path === `/admin/bonus/scores/${SCORE}/adjust`)?.body).toEqual({
      delta: -15,
      reasonCode: 'MASTER_REVIEW',
      comment: 'Ушёл раньше без предупреждения',
    });
  });

  it('a shift under manual review offers to finish it with a score', async () => {
    const state = { status: 'OPEN', scoreStatus: 'MANUAL_REVIEW' };
    const calls = mockApi(state);
    render(<BonusPage />);
    expect((await screen.findAllByText('Кузнецов Леонид')).length).toBeGreaterThan(0);
    await clickRowAction('Расшифровка');
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/Применимо только 45 из 100/)).toBeTruthy();
    expect(within(sheet).getByText('Что делать')).toBeTruthy();
    fireEvent.click(within(sheet).getAllByRole('button', { name: 'Завершить проверку' })[0]!);
    const dialogs = await screen.findAllByRole('dialog');
    const dialog = dialogs[dialogs.length - 1]!;
    expect((within(dialog).getByLabelText(/Балл смены/) as HTMLInputElement).value).toBe('89');
    fireEvent.change(within(dialog).getByLabelText(/Балл смены/), {
      target: { value: '80' },
    });
    fireEvent.change(within(dialog).getByLabelText('Комментарий (обязательно)'), {
      target: { value: 'Смена без графика, работа сделана' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Завершить проверку' }));
    expect(await screen.findByText('Проверка завершена.')).toBeTruthy();
    expect(calls.find((c) => c.path === `/admin/bonus/scores/${SCORE}/review`)?.body).toEqual({
      decision: 'SCORE',
      score: 80,
      comment: 'Смена без графика, работа сделана',
    });
  });

  it('closing the period with confirmation and a comment; afterwards export and the base field exist', async () => {
    const state = { status: 'OPEN' };
    const calls = mockApi(state);
    render(<BonusPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Закрыть период' }));
    // Closing asks for confirmation and a mandatory comment in a dialog.
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText('Комментарий (обязательно)'), {
      target: { value: 'Октябрь закрыт' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть период' }));
    await screen.findByText('Период закрыт.');
    expect(calls.find((c) => c.path.endsWith('/close'))?.body).toEqual({
      comment: 'Октябрь закрыт',
    });
    expect(await screen.findByRole('link', { name: 'Выгрузить CSV' })).toBeTruthy();
    expect(screen.getByLabelText('Бонусная база Кузнецов Леонид')).toBeTruthy();

    // A closed period says so and can be reopened with a comment; scores become editable again.
    expect(screen.getByText('Период закрыт')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Открыть период снова' })[0]!);
    const reopen = await screen.findByRole('alertdialog');
    fireEvent.change(within(reopen).getByLabelText('Комментарий (обязательно)'), {
      target: { value: 'Забыли проверку' },
    });
    fireEvent.click(within(reopen).getByRole('button', { name: 'Открыть период снова' }));
    await screen.findByText('Период открыт снова.');
    expect(calls.find((c) => c.path.endsWith('/reopen'))?.body).toEqual({
      comment: 'Забыли проверку',
    });
    expect(await screen.findByRole('button', { name: 'Закрыть период' })).toBeTruthy();
  });
});
