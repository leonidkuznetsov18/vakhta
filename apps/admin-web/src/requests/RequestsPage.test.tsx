import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RequestsPage } from './RequestsPage.tsx';

const REQ = 'c0000000-0000-4000-8000-000000000001';
const SESSION = 'd0000000-0000-4000-8000-000000000001';

function request(type: string, status = 'SUBMITTED', over: Record<string, unknown> = {}) {
  return {
    id: REQ,
    type,
    status,
    employeeId: 'e1',
    employeeName: 'Кузнецов Леонид',
    currentStep: 0,
    currentStepKey: status === 'SUBMITTED' ? 'MASTER' : null,
    totalSteps: 1,
    periodFrom: null,
    periodTo: null,
    assignmentId: 'a1',
    assignmentDate: '2026-10-05',
    counterpartEmployeeId: null,
    counterpartName: null,
    shiftSessionId: type === 'CORRECTION' ? SESSION : null,
    comment: 'Пробки на мосту',
    minutes: type === 'LATE' ? 20 : null,
    approvedMinutes: null,
    hasMedicalDocument: false,
    medicalMediaId: null,
    submittedAt: '2026-10-04T06:00:00.000Z',
    stepDeadlineAt: '2026-10-04T10:00:00.000Z',
    decidedAt: null,
    resultVersionId: null,
    overdue: true,
    ...over,
  };
}

class FakeEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {}
  addEventListener() {}
  close() {}
}

function mockApi(state: { row: ReturnType<typeof request> }) {
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
      if (url.pathname === '/admin/requests')
        return json(
          state.row.status === 'SUBMITTED' || url.searchParams.get('scope') === 'all'
            ? [state.row]
            : [],
        );
      if (url.pathname === '/admin/requests/overtime') {
        return json([
          {
            id: null,
            shiftSessionId: SESSION,
            employeeId: 'e1',
            employeeName: 'Кузнецов Леонид',
            businessDate: '2026-10-03',
            minutes: 45,
            status: 'PENDING',
            decidedBy: null,
            comment: null,
            decidedAt: null,
          },
        ]);
      }
      if (url.pathname === `/admin/requests/${REQ}`)
        return json({ request: state.row, decisions: [], serverTime: 'x' });
      if (url.pathname === `/admin/shifts/${SESSION}`) {
        return json({
          session: {},
          intervals: [
            {
              id: 'i1',
              state: 'WORKING',
              startedAt: '2026-10-03T05:00:00.000Z',
              endedAt: null,
              resumeState: null,
              reasonCode: null,
            },
          ],
          summary: null,
          events: [],
          serverTime: 'x',
        });
      }
      if (url.pathname === `/admin/requests/${REQ}/decide`) {
        state.row = request(state.row.type as string, body.decision, {
          approvedMinutes: body.approvedMinutes ?? null,
        });
        return json(state.row);
      }
      if (url.pathname === `/admin/requests/overtime/${SESSION}/decide`)
        return json({ shiftSessionId: SESSION, status: body.decision });
      return json({ code: 'NOT_FOUND', message: url.pathname }, 404);
    }),
  );
  return calls;
}

describe('RequestsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('вхідні: запізнення схвалюється з коментарем і затвердженими хвилинами; переробка вирішується окремо', async () => {
    const state = { row: request('LATE') };
    const calls = mockApi(state);
    render(<RequestsPage />);
    expect(await screen.findByText('Опоздаю')).toBeTruthy();
    expect(screen.getByText('Просрочено')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Подробности' }));
    expect(await screen.findByText('Пробки на мосту')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Утверждённое отклонение, мин'), {
      target: { value: '15' },
    });
    fireEvent.change(screen.getAllByLabelText('Комментарий (обязательно)')[0]!, {
      target: { value: 'Подтверждаю 15 минут' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Одобрить' })[0]!);
    await screen.findByText('Решение сохранено.');
    expect(calls.find((c) => c.path.endsWith('/decide') && c.path.includes(REQ))?.body).toEqual({
      decision: 'APPROVED',
      comment: 'Подтверждаю 15 минут',
      approvedMinutes: 15,
    });

    expect(screen.getByText('45')).toBeTruthy();
    fireEvent.change(screen.getAllByLabelText('Комментарий (обязательно)').at(-1)!, {
      target: { value: 'Замена заболевшего' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Одобрить' }).at(-1)!);
    await vi.waitFor(() =>
      expect(calls.some((c) => c.path === `/admin/requests/overtime/${SESSION}/decide`)).toBe(true),
    );
    expect(
      calls.find((c) => c.path === `/admin/requests/overtime/${SESSION}/decide`)?.body,
    ).toEqual({ decision: 'APPROVED', comment: 'Замена заболевшего' });
  });

  it('корекція: майстер задає пропозицію закриття зміни і схвалює', async () => {
    const state = { row: request('CORRECTION', 'SUBMITTED', { assignmentDate: null }) };
    const calls = mockApi(state);
    render(<RequestsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Подробности' }));
    const kind = (await screen.findByLabelText('Тип коррекции')) as HTMLSelectElement;
    expect(kind.value).toBe('CLOSE_SHIFT_AT');
    fireEvent.change(screen.getByLabelText('Новое время'), {
      target: { value: '2026-10-03T20:05' },
    });
    fireEvent.change(screen.getAllByLabelText('Комментарий (обязательно)')[0]!, {
      target: { value: 'По камерам ушёл в 20:05' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Одобрить' })[0]!);
    await screen.findByText('Решение сохранено.');
    const body = calls.find((c) => c.path.endsWith('/decide') && c.path.includes(REQ))?.body as {
      proposal: { kind: string; endedAt: string };
    };
    expect(body.proposal.kind).toBe('CLOSE_SHIFT_AT');
    expect(body.proposal.endedAt).toBe(new Date('2026-10-03T20:05').toISOString());
  });
});
