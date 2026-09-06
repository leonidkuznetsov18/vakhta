import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IncidentsPage } from './IncidentsPage.tsx';

const SITE = 'a0000000-0000-4000-8000-000000000001';
const INC = 'c0000000-0000-4000-8000-000000000001';
const INC2 = 'c0000000-0000-4000-8000-000000000002';

const org = {
  sites: [{ id: SITE, code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' }],
  orgUnits: [],
  teams: [],
  positions: [],
  zones: [],
  terminals: [],
  reasonCodes: [],
};

function incident(id: string, status: string, over: Record<string, unknown> = {}) {
  return {
    id,
    siteId: SITE,
    orgUnitId: null,
    zoneId: 'z',
    zoneName: 'Линия A',
    reasonCode: 'BREAKDOWN',
    reasonLabel: 'Поломка',
    severity: 'NORMAL',
    status,
    duplicateOfId: null,
    assigneeId: null,
    openedAt: '2026-09-07T06:00:00.000Z',
    slaDueAt: '2026-09-07T07:00:00.000Z',
    acknowledgedAt: null,
    resolvedAt: null,
    closedAt: null,
    escalatedAt: null,
    slaBreached: false,
    reportsCount: 2,
    stoppedNow: 1,
    lastComment: 'Заклинило',
    ...over,
  };
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners: Record<string, (() => void)[]> = {};
  constructor(readonly url: string) {
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

function mockApi(state: { rows: ReturnType<typeof incident>[] }) {
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
      if (url.pathname === '/admin/incidents') return json(state.rows);
      if (url.pathname === '/admin/incidents/stats') {
        const row = {
          key: 'BREAKDOWN',
          label: 'Поломка',
          incidents: 1,
          reports: 2,
          downtimeMinutes: 45,
          avgResolutionMinutes: 30,
          slaBreached: 0,
        };
        return json({
          from: 'x',
          to: 'y',
          byReason: [row],
          byZone: [{ ...row, key: 'z', label: 'Линия A' }],
          totals: { ...row, key: 'TOTAL', label: 'Итого' },
        });
      }
      if (url.pathname === `/admin/incidents/${INC}` && method === 'GET') {
        return json({
          incident: state.rows[0],
          reports: [
            {
              id: 'r1',
              incidentId: INC,
              shiftSessionId: null,
              employeeId: 'e',
              fullName: 'Кузнецов Леонид',
              zoneId: 'z',
              reasonCode: 'BREAKDOWN',
              comment: 'Заклинило',
              stoppedWork: true,
              reportedAt: '2026-09-07T06:00:00.000Z',
              hasPhoto: true,
            },
          ],
          history: [
            {
              id: 'h1',
              fromStatus: null,
              toStatus: 'REPORTED',
              actorType: 'EMPLOYEE',
              actorId: 'e',
              at: '2026-09-07T06:00:00.000Z',
              comment: null,
            },
          ],
          duplicates: [],
          serverTime: 'x',
        });
      }
      if (url.pathname === `/admin/incidents/${INC}/transition`) {
        state.rows = [incident(INC, body.to, { acknowledgedAt: 'x' }), ...state.rows.slice(1)];
        return json(state.rows[0]);
      }
      return json({ code: 'NOT_FOUND', message: url.pathname }, 404);
    }),
  );
  return calls;
}

describe('IncidentsPage', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the queue, details with reports and statistics; acknowledgement carries a comment', async () => {
    const state = {
      rows: [incident(INC, 'REPORTED'), incident(INC2, 'REPORTED', { zoneName: 'Линия B' })],
    };
    const calls = mockApi(state);
    render(<IncidentsPage />);
    expect(await screen.findAllByText('Поломка')).toHaveLength(3);
    expect(screen.getAllByText('Сообщено')).toHaveLength(2);
    expect(await screen.findAllByText('Итого')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Подробности' })[0]!);
    expect(await screen.findByText('Кузнецов Леонид')).toBeTruthy();
    expect(screen.getByText(/работа остановлена · фото · Заклинило/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Статус'), { target: { value: 'ACKNOWLEDGED' } });
    fireEvent.change(screen.getByLabelText('Комментарий'), { target: { value: 'Иду смотреть' } });
    fireEvent.click(screen.getByRole('button', { name: 'Выполнить' }));
    await screen.findByText('Статус изменён.');
    expect(calls.find((c) => c.path.endsWith('/transition'))?.body).toEqual({
      to: 'ACKNOWLEDGED',
      comment: 'Иду смотреть',
    });
    expect(await screen.findByText('Подтверждён')).toBeTruthy();
  });

  it('a duplicate requires choosing the primary incident; an SSE event re-reads the list', async () => {
    const state = {
      rows: [incident(INC, 'REPORTED'), incident(INC2, 'REPORTED', { zoneName: 'Линия B' })],
    };
    const calls = mockApi(state);
    render(<IncidentsPage />);
    await screen.findAllByText('Поломка');
    fireEvent.click(screen.getAllByRole('button', { name: 'Подробности' })[0]!);
    fireEvent.change(await screen.findByLabelText('Статус'), { target: { value: 'DUPLICATE' } });
    const dup = (await screen.findByLabelText('Дубликат инцидента')) as HTMLSelectElement;
    expect(dup.options).toHaveLength(2);
    fireEvent.change(dup, { target: { value: INC2 } });
    fireEvent.click(screen.getByRole('button', { name: 'Выполнить' }));
    await screen.findByText('Статус изменён.');
    expect(calls.find((c) => c.path.endsWith('/transition'))?.body).toEqual({
      to: 'DUPLICATE',
      duplicateOfId: INC2,
    });

    const before = calls.filter((c) => c.path === '/admin/incidents').length;
    FakeEventSource.instances[0]!.emit('incident');
    await waitFor(() =>
      expect(calls.filter((c) => c.path === '/admin/incidents').length).toBe(before + 1),
    );
  });
});
