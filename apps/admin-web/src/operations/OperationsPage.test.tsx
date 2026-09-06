import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OperationsPage } from './OperationsPage.tsx';
import { clickRowAction } from '../test-utils.ts';

const SITE = 'a0000000-0000-4000-8000-000000000001';
const UNIT = 'a0000000-0000-4000-8000-000000000002';
const EMP = 'b0000000-0000-4000-8000-000000000001';
const SESSION = 'c0000000-0000-4000-8000-000000000001';

const org = {
  sites: [{ id: SITE, code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' }],
  orgUnits: [{ id: UNIT, siteId: SITE, parentId: null, name: 'Цех фасовки' }],
  teams: [],
  positions: [],
  zones: [],
  terminals: [],
  reasonCodes: [],
};

function row(state: string, version = 3) {
  return {
    id: SESSION,
    employeeId: EMP,
    assignmentId: null,
    businessDate: '2026-09-07',
    state,
    resumeState: state === 'BREAK' ? 'WORKING' : null,
    version,
    startedAt: '2026-09-07T05:00:00.000Z',
    endedAt: null,
    stateSince: '2026-09-07T06:00:00.000Z',
    planStartAt: '2026-09-07T05:00:00.000Z',
    planEndAt: '2026-09-07T17:00:00.000Z',
    zoneId: null,
    zoneName: 'Линия 1',
    zoneAccepted: true,
    needsClarification: false,
    clarificationReason: null,
    fullName: 'Кузнецов Леонид',
    personnelNumber: '0001',
    orgUnitName: 'Цех фасовки',
    presenceSince: '2026-09-07T04:50:00.000Z',
    stateMinutes: 12,
  };
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners: Record<string, (() => void)[]> = {};
  constructor(
    readonly url: string,
    readonly init?: { withCredentials?: boolean },
  ) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: () => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  emit(type: string) {
    for (const cb of this.listeners[type] ?? []) cb();
  }
  close() {}
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function mockApi(state: { rows: ReturnType<typeof row>[] }) {
  const calls: Call[] = [];
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
      if (url.pathname === '/admin/employees') {
        return json([
          {
            id: EMP,
            personnelNumber: '0001',
            fullName: 'Кузнецов Леонид',
            status: 'ACTIVE',
            telegramLinked: true,
            currentPosition: null,
            createdAt: 'x',
          },
        ]);
      }
      if (url.pathname === '/admin/shifts' && method === 'GET') return json(state.rows);
      if (url.pathname === `/admin/shifts/${SESSION}` && method === 'GET') {
        return json({
          session: state.rows[0],
          intervals: [
            {
              id: 'i1',
              state: 'PREPARATION',
              startedAt: '2026-09-07T05:00:00.000Z',
              endedAt: '2026-09-07T06:00:00.000Z',
              resumeState: null,
              reasonCode: null,
            },
          ],
          summary: null,
          events: [
            {
              id: 'e1',
              type: 'SHIFT_STARTED',
              occurredAt: '2026-09-07T05:00:00.000Z',
              actorType: 'EMPLOYEE',
              reasonCode: null,
              comment: null,
              payload: {},
            },
          ],
          serverTime: '2026-09-07T06:12:00.000Z',
        });
      }
      if (url.pathname === `/admin/shifts/${SESSION}/transition`) {
        if (body.expectedVersion !== state.rows[0]?.version) {
          return json({
            ok: false,
            error: 'VERSION_CONFLICT',
            session: state.rows[0],
            serverTime: 'x',
          });
        }
        state.rows = [{ ...row('WORKING', body.expectedVersion + 1) }];
        return json({
          ok: true,
          session: state.rows[0],
          summary: null,
          replayed: false,
          serverTime: 'x',
        });
      }
      return json({ code: 'NOT_FOUND', message: url.pathname }, 404);
    }),
  );
  return calls;
}

describe('OperationsPage', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows shifts with state and duration and refreshes on an SSE event', async () => {
    const state = { rows: [row('BREAK')] };
    const calls = mockApi(state);
    render(<OperationsPage />);
    expect(await screen.findByText('Кузнецов Леонид')).toBeTruthy();
    // The state appears as a KPI chip with its count and as the pill in the row.
    expect(screen.getAllByText('Перерыв').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/12 мин/)).toBeTruthy();

    const source = FakeEventSource.instances[0]!;
    expect(source.url).toContain('/admin/shifts/stream');
    expect(source.init?.withCredentials).toBe(true);
    source.onopen?.();
    expect(await screen.findByText('Обновляется в реальном времени')).toBeTruthy();

    state.rows = [row('WORKING', 4)];
    const before = calls.filter((c) => c.path === '/admin/shifts').length;
    source.emit('shift');
    await waitFor(() =>
      expect(calls.filter((c) => c.path === '/admin/shifts').length).toBe(before + 1),
    );
    expect(await screen.findByText('Основная работа')).toBeTruthy();
  });

  it('a master action carries a comment and the current version; a version conflict is explained', async () => {
    const state = { rows: [row('BREAK')] };
    const calls = mockApi(state);
    render(<OperationsPage />);
    await clickRowAction('Подробности');
    expect(await screen.findByText('SHIFT_STARTED')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Действие мастера'), { target: { value: 'RESUME' } });
    fireEvent.change(screen.getAllByLabelText('Комментарий (обязательно)')[0]!, {
      target: { value: 'Вернулся, забыл нажать' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Выполнить' }));
    await screen.findByText('Действие выполнено.');
    const call = calls.find((c) => c.path.endsWith('/transition'));
    expect(call?.body).toMatchObject({
      action: 'RESUME',
      expectedVersion: 3,
      comment: 'Вернулся, забыл нажать',
    });
    expect(typeof (call?.body as { idempotencyKey?: unknown }).idempotencyKey).toBe('string');
  });
});
