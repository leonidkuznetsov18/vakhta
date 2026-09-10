import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { setUiState } from '@/lib/ui-store';
import { IncidentKnowledgePage } from '@/pages/incident-knowledge';
import { IncidentsPage } from './IncidentsPage.tsx';
import { clickRowAction, render } from '../test-utils.tsx';

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
    reportedBy: 'Кузнецов Леонид',
    reportsCount: 2,
    stoppedNow: 1,
    lastComment: 'Заклинило',
    rootCause: null,
    resolution: null,
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

function mockApi(state: { rows: ReturnType<typeof incident>[]; media?: unknown }) {
  const calls: { method: string; path: string; search: string; body: unknown }[] = [];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, path: url.pathname, search: url.search, body });
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
              media: state.media ?? null,
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
      if (url.pathname.startsWith('/admin/incidents/media/')) {
        return json({ url: 'https://storage.example/incident.jpg?signed=1', expiresAt: 'x' });
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
    await waitFor(() => expect(screen.getAllByText('Поломка').length).toBeGreaterThanOrEqual(3));
    expect(screen.getAllByText('Сообщено')).toHaveLength(2);
    expect(await screen.findAllByText('Итого')).toHaveLength(2);

    await clickRowAction('Подробности');
    expect(await screen.findByText(/работа остановлена · фото/)).toBeTruthy();
    // The name is in the row's own column and again in the report under it.
    expect(screen.getAllByText('Кузнецов Леонид').length).toBeGreaterThanOrEqual(2);

    fireEvent.change(screen.getByLabelText('Статус'), { target: { value: 'ACKNOWLEDGED' } });
    fireEvent.change(screen.getByLabelText('Причина'), { target: { value: 'Иду смотреть' } });
    fireEvent.click(screen.getByRole('button', { name: 'Выполнить' }));
    await screen.findByText('Статус изменён.');
    expect(calls.find((c) => c.path.endsWith('/transition'))?.body).toEqual({
      to: 'ACKNOWLEDGED',
      rootCause: 'Иду смотреть',
    });
    expect((await screen.findAllByText('Подтверждён')).length).toBeGreaterThanOrEqual(1);
  });

  it('the photo of a report is shown, not the word "photo"', async () => {
    mockApi({
      rows: [incident(INC, 'REPORTED')],
      media: {
        id: 'm1',
        quality: 'OK',
        width: 1280,
        height: 960,
        receivedAt: '2026-09-07T06:00:30.000Z',
        processedAt: '2026-09-07T06:01:00.000Z',
        duplicateOfId: null,
      },
    });
    render(<IncidentsPage />);
    await screen.findAllByText('Поломка');
    await clickRowAction('Подробности');

    // The thumbnail arrives behind a signed link, and the line stops saying the word.
    const thumb = await screen.findByAltText(/Кузнецов Леонид/);
    expect(thumb.getAttribute('src')).toBe('https://storage.example/incident.jpg?signed=1');
    expect(screen.queryByText(/· фото ·/)).toBeNull();
  });

  it('a duplicate requires choosing the primary incident; an SSE event re-reads the list', async () => {
    const state = {
      rows: [incident(INC, 'REPORTED'), incident(INC2, 'REPORTED', { zoneName: 'Линия B' })],
    };
    const calls = mockApi(state);
    render(<IncidentsPage />);
    await screen.findAllByText('Поломка');
    await clickRowAction('Подробности');
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
  it('requires both solution fields before resolving and submits structured notes', async () => {
    const calls = mockApi({ rows: [incident(INC, 'IN_PROGRESS')] });
    render(<IncidentsPage />);
    await clickRowAction('Решено');
    const cause = await screen.findByLabelText('Причина');
    fireEvent.change(cause, { target: { value: 'Worn belt' } });
    fireEvent.submit(cause.closest('form')!);
    expect((await screen.findByRole('alert')).textContent).toContain('Для решения');
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Как решили?'), {
      target: { value: 'Replaced the belt' },
    });
    fireEvent.submit(cause.closest('form')!);
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/transition'))?.body).toEqual({
        to: 'RESOLVED',
        rootCause: 'Worn belt',
        resolution: 'Replaced the belt',
      }),
    );
  });

  it('shows historical solutions in the knowledge base without an editing form', async () => {
    mockApi({
      rows: [
        incident(INC, 'CLOSED', { rootCause: 'Worn belt', resolution: 'Replace and tension' }),
      ],
    });
    render(<IncidentKnowledgePage />);
    expect(await screen.findByText('Replace and tension')).toBeTruthy();
    fireEvent.click(screen.getByText('Worn belt'));
    expect(await screen.findByText('Сообщения сотрудников')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Причина' })).toBeNull();
    expect(screen.getAllByText('Replace and tension').length).toBeGreaterThan(1);
  });
  it('applies the selected calendar period to the incident list and statistics', async () => {
    setUiState({ 'incidents.date': '2026-10-25', 'incidents.period': 'day' });
    const calls = mockApi({ rows: [incident(INC, 'REPORTED')] });
    render(<IncidentsPage />);
    await waitFor(() => {
      const list = calls.find((call) => call.path === '/admin/incidents');
      expect(new URLSearchParams(list?.search).get('from')).toBe('2026-10-24T21:00:00.000Z');
      const stats = calls.find((call) => call.path.endsWith('/stats'));
      expect(new URLSearchParams(stats?.search).get('to')).toBe('2026-10-25T22:00:00.000Z');
    });
    // Browser QA covers the calendar interaction; this test checks the shared filter/API boundary.
    act(() => setUiState({ 'incidents.period': 'year' }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.path === '/admin/incidents' &&
            new URLSearchParams(call.search).get('from') === '2025-12-31T22:00:00.000Z',
        ),
      ).toBe(true),
    );
  });
  it.each(['RESOLVED', 'CLOSED', 'REJECTED', 'DUPLICATE'])(
    'shows %s incidents as read-only information',
    async (status) => {
      mockApi({
        rows: [incident(INC, status, { rootCause: 'Worn belt', resolution: 'Replaced belt' })],
      });
      render(<IncidentsPage />);
      await clickRowAction('Подробности');
      const detail = await screen.findByTestId('incident-detail');
      expect(detail.querySelector('textarea, select, form, button[type="submit"]')).toBeNull();
      expect(detail.textContent).toContain('Replaced belt');
      expect(screen.queryByRole('menuitem', { name: 'В работу' })).toBeNull();
    },
  );
});
