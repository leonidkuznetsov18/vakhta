import { stubFetch } from '@/test/stub-fetch';
import type { ReactNode } from 'react';
import { CommunicationProvider } from '@/features/employee-communications';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { setUiState, uiState } from '@/lib/ui-store';
import { todayIso } from '@/lib/format';
import { OperationsPage } from './OperationsPage.tsx';
import { clickRowAction, renderRouted as renderBase } from '../test-utils.tsx';

const render = (ui: ReactNode) => renderBase(<CommunicationProvider>{ui}</CommunicationProvider>);

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
  reasonCodes: [
    {
      kind: 'EMERGENCY',
      code: 'HEALTH',
      label: 'Самочувствие',
      requiresComment: true,
      requiresPhoto: false,
      notifyMaster: true,
      severity: 'NORMAL',
      isActive: true,
    },
    {
      kind: 'DOWNTIME',
      code: 'BREAKDOWN',
      label: 'Поломка',
      requiresComment: true,
      requiresPhoto: false,
      notifyMaster: true,
      severity: 'NORMAL',
      isActive: true,
    },
  ],
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
    endedAt:
      state === 'SHIFT_CLOSED' || state === 'EMERGENCY_EXIT' ? '2026-09-07T17:00:00.000Z' : null,
    stateSince: '2026-09-07T06:00:00.000Z',
    planStartAt: '2026-09-07T05:00:00.000Z',
    planEndAt: '2026-09-07T17:00:00.000Z',
    zoneId: null,
    zoneName: 'Линия 1',
    zoneAccepted: true,
    needsClarification: false,
    clarificationReason: null,
    autoCloseReason: null,
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

const ABSENT = 'b0000000-0000-4000-8000-000000000002';

function staffing(businessDate: string) {
  return {
    planned: 2,
    present: 1,
    notArrived: 1,
    expected: 0,
    unscheduled: 0,
    presentPeople: [],
    expectedPeople: [],
    notArrivedPeople: [
      {
        employeeId: ABSENT,
        fullName: 'Ярошенко Лідія',
        personnelNumber: '0002',
        orgUnitName: 'Цех фасовки',
        planStartAt: '2026-09-07T05:00:00.000Z',
        planEndAt: '2026-09-07T17:00:00.000Z',
        zoneName: 'Линия 2',
      },
    ],
    unscheduledPeople: [],
    oldestNotArrivedSince: '2026-09-07T05:00:00.000Z',
    businessDate,
  };
}

function mockApi(state: {
  rows: ReturnType<typeof row>[];
  staffing?: ReturnType<typeof staffing> | null;
}) {
  const calls: Call[] = [];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  stubFetch(
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
          {
            id: ABSENT,
            personnelNumber: '0002',
            fullName: 'Ярошенко Лідія',
            status: 'ACTIVE',
            telegramLinked: true,
            currentPosition: null,
            createdAt: 'x',
          },
        ]);
      }
      if (url.pathname === '/admin/shifts' && method === 'GET') return json(state.rows);
      if (url.pathname === '/admin/overview')
        return json({
          generatedAt: '2026-09-07T06:30:00.000Z',
          lateGraceMinutes: 10,
          staffing: state.staffing ?? null,
        });
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
    history.replaceState(null, '', '#/operations');
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses only the URL for the selected row and clears selection when the URL has no ID', async () => {
    mockApi({ rows: [row('BREAK')] });
    setUiState({ 'operations.openId': SESSION });
    const view = await render(<OperationsPage />);
    await screen.findByText('Кузнецов Леонид');
    expect(screen.queryByText('SHIFT_STARTED')).toBeNull();
    await clickRowAction('Подробности');
    await screen.findByText('SHIFT_STARTED');
    expect(location.hash).toBe(`#/operations/${SESSION}`);
    await act(async () => {
      await view.router.navigate({
        to: '/operations/{-$id}',
        params: { id: undefined },
        replace: true,
      });
    });
    await waitFor(() => expect(screen.queryByText('SHIFT_STARTED')).toBeNull());
    expect(location.hash).toBe('#/operations');
  });

  it('shows shifts with state and duration and refreshes on an SSE event', async () => {
    const state = { rows: [row('BREAK')] };
    const calls = mockApi(state);
    await render(<OperationsPage />);
    expect(await screen.findByText('Кузнецов Леонид')).toBeTruthy();
    // The state appears as a KPI chip with its count and as the pill in the row.
    expect(screen.getAllByText('Перерыв').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/12 мин/)).toBeTruthy();

    const source = FakeEventSource.instances[0]!;
    expect(source.url).toContain('/admin/shifts/stream');
    expect(source.init?.withCredentials).toBe(true);
    source.onopen?.();
    // The live state is a dot; its words live in the accessible name and the tooltip.
    expect(
      await screen.findByRole('status', { name: 'Обновляется в реальном времени' }),
    ).toBeTruthy();

    state.rows = [row('WORKING', 4)];
    const before = calls.filter((c) => c.path === '/admin/shifts').length;
    source.emit('shift');
    await waitFor(() =>
      expect(calls.filter((c) => c.path === '/admin/shifts').length).toBe(before + 1),
    );
    expect(await screen.findByText('Основная работа')).toBeTruthy();
  });

  it('offers a Today shortcut that is disabled while the list already stands on today', async () => {
    mockApi({ rows: [row('BREAK')] });
    setUiState({ 'operations.day': '2026-09-01' });
    await render(<OperationsPage />);
    expect(await screen.findByText('Кузнецов Леонид')).toBeTruthy();
    const today = screen.getByRole('button', { name: 'Сегодня' });
    expect(today.hasAttribute('disabled')).toBe(false);
    fireEvent.click(today);
    expect(today.hasAttribute('disabled')).toBe(true);
    expect(uiState('operations.day')).toBe(todayIso());
  });

  it('a master action carries a comment and the current version; a version conflict is explained', async () => {
    const state = { rows: [row('BREAK')] };
    const calls = mockApi(state);
    await render(<OperationsPage />);
    await clickRowAction('Подробности');
    expect(await screen.findByText('SHIFT_STARTED')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Действие мастера'), { target: { value: 'RESUME' } });
    fireEvent.change(screen.getAllByLabelText('Комментарий (обязательно)')[0]!, {
      target: { value: 'Вернулся, забыл нажать' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Выполнить' }));
    await screen.findByText(
      'Кузнецов Леонид: ↩️ Вернуть в работу. Состояние смены: Основная работа.',
    );
    const call = calls.find((c) => c.path.endsWith('/transition'));
    expect(call?.body).toMatchObject({
      action: 'RESUME',
      expectedVersion: 3,
      comment: 'Вернулся, забыл нажать',
    });
    expect(typeof (call?.body as { idempotencyKey?: unknown }).idempotencyKey).toBe('string');
  });

  it('the emergency exit asks for a reason from the directory, and only then', async () => {
    const state = { rows: [row('WORKING')] };
    const calls = mockApi(state);
    await render(<OperationsPage />);
    await clickRowAction('Подробности');
    expect(await screen.findByText('SHIFT_STARTED')).toBeTruthy();

    // Nothing to pick until the action needs one: an empty control on every other action is noise.
    expect(screen.queryByLabelText('Причина')).toBeNull();

    fireEvent.change(screen.getByLabelText('Действие мастера'), {
      target: { value: 'EMERGENCY_EXIT' },
    });
    fireEvent.change(screen.getAllByLabelText('Комментарий (обязательно)')[0]!, {
      target: { value: 'Ушёл по самочувствию' },
    });
    // The reason is required, so the button waits for it instead of failing on the server.
    expect(screen.getByRole('button', { name: 'Выполнить' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('Причина'), { target: { value: 'HEALTH' } });
    fireEvent.click(screen.getByRole('button', { name: 'Выполнить' }));
    await screen.findByText(/Кузнецов Леонид: /);
    expect(calls.find((c) => c.path.endsWith('/transition'))?.body).toMatchObject({
      action: 'EMERGENCY_EXIT',
      reasonCode: 'HEALTH',
      comment: 'Ушёл по самочувствию',
    });
  });

  it('offers only the actions this shift can take next', async () => {
    mockApi({ rows: [row('HANDOVER')] });
    await render(<OperationsPage />);
    await clickRowAction('Подробности');
    expect(await screen.findByText('SHIFT_STARTED')).toBeTruthy();

    const options = [...screen.getByLabelText('Действие мастера').querySelectorAll('option')].map(
      (o) => o.value,
    );
    // From handover: send the report, go back to cleaning, close it as the master, or walk out.
    expect(options).toContain('CLOSE_SHIFT');
    expect(options).toContain('SUBMIT_HANDOVER');
    // Not from here: work has not been started again, and the shift is past its preparation.
    expect(options).not.toContain('START_WORK');
    expect(options).not.toContain('START_SHIFT');
  });
  it.each(['SHIFT_CLOSED', 'EMERGENCY_EXIT'])(
    'shows terminal %s shift details without action or message fields',
    async (state) => {
      setUiState({ 'operations.scope': 'ALL' });
      mockApi({ rows: [row(state)] });
      await render(<OperationsPage />);
      await clickRowAction('Подробности');
      const detail = await screen.findByTestId('shift-detail');
      expect(detail.querySelector('textarea, select, form, button[type="submit"]')).toBeNull();
      expect(await screen.findByText('SHIFT_STARTED')).toBeTruthy();
    },
  );

  it('lists people who did not arrive as rows with their own status and filter', async () => {
    setUiState({ 'operations.day': '2026-09-07', 'operations.group': 'NOT_ARRIVED' });
    mockApi({ rows: [row('WORKING')], staffing: staffing('2026-09-07') });
    await render(<OperationsPage />);
    expect(await screen.findByText('Ярошенко Лідія')).toBeTruthy();
    // The overview link opens the filter, so only the missing person is listed, with the gap.
    expect(screen.queryByText('Кузнецов Леонид')).toBeNull();
    expect(screen.getAllByText('Не на смене').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1 ч 30 мин/)).toBeTruthy();
    // The preset reads as a named filter in the toolbar, with its count.
    const filter = screen.getByRole('combobox', { name: 'Состояние' });
    expect((filter as HTMLSelectElement).value).toBe('NOT_ARRIVED');
    expect(screen.getByRole('option', { name: 'Не пришли (1)' })).toBeTruthy();

    fireEvent.click(screen.getByText('Ярошенко Лідія'));
    expect(await screen.findByTestId('not-arrived-detail')).toBeTruthy();
    const [start] = screen.getAllByRole('button', { name: 'Открыть смену' });
    if (start) fireEvent.click(start);
    const dialog = await screen.findByRole('dialog');
    expect((dialog.querySelector('select') as HTMLSelectElement | null)?.value).toBe(ABSENT);
  });

  it('keeps a person who has a shift row out of the not-arrived list', async () => {
    setUiState({ 'operations.day': '2026-09-07', 'operations.group': 'ALL' });
    const late = staffing('2026-09-07');
    mockApi({
      rows: [row('WORKING')],
      staffing: {
        ...late,
        notArrivedPeople: late.notArrivedPeople.map((p) => ({ ...p, employeeId: EMP })),
      },
    });
    await render(<OperationsPage />);
    expect(await screen.findByText('Кузнецов Леонид')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Не на смене')).toBeNull());
  });

  it('does not add the current shift no-shows to another day', async () => {
    setUiState({ 'operations.day': '2026-09-06', 'operations.group': 'NOT_ARRIVED' });
    mockApi({ rows: [row('WORKING')], staffing: staffing('2026-09-07') });
    await render(<OperationsPage />);
    expect(await screen.findByText('Кузнецов Леонид')).toBeTruthy();
    expect(screen.queryByText('Ярошенко Лідія')).toBeNull();
    expect(screen.queryByRole('radio', { name: /Не пришли/ })).toBeNull();
  });
});
