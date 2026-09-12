import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { ScheduleVersionDetail } from '@vakhta/contracts';
import { setUiState } from '@/lib/ui-store';
import { gridFromDetail, gridToItems, setAssignment, setCell } from '../model/grid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
  render as renderRaw,
} from '@testing-library/react';
import { render } from '@/test-utils';
import { ScheduleWorkspace as SchedulePage } from './schedule-workspace';
import { scheduleDraftKey } from '../model/ownership';
import { useScheduleDrafts } from '../model/store';
import { writeSchedulePreset } from '../model/preset';
import { clearPersistentState } from '@/lib/ui-store';
import { notifySuccess } from '@/lib/toast';
import { NavigationProvider } from '@/navigation';

vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn() }));

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => viewport.mobile }));

const SITE = 'a0000000-0000-4000-8000-000000000001';
const UNIT = 'a0000000-0000-4000-8000-000000000002';
const ZONE = 'a0000000-0000-4000-8000-000000000003';
const EMP = 'b0000000-0000-4000-8000-000000000001';
const EMP2 = 'b0000000-0000-4000-8000-000000000002';
const TPL_DAY = 'c0000000-0000-4000-8000-000000000001';
const TPL_NIGHT = 'c0000000-0000-4000-8000-000000000002';
const VERSION = 'd0000000-0000-4000-8000-000000000001';
const ACTOR = 'f0000000-0000-4000-8000-000000000001';
const DRAFT_KEY = scheduleDraftKey(ACTOR, SITE, UNIT, '2026-09', VERSION);
const ASSIGN = 'e0000000-0000-4000-8000-000000000001';

const org = {
  sites: [{ id: SITE, code: 'main', name: 'Основная площадка', timezone: 'Europe/Moscow' }],
  orgUnits: [{ id: UNIT, siteId: SITE, parentId: null, name: 'Цех фасовки' }],
  teams: [],
  positions: [],
  zones: [
    {
      id: ZONE,
      siteId: SITE,
      orgUnitId: UNIT,
      code: 'L1',
      name: 'Линия 1',
      type: 'AREA',
      isShared: false,
      isActive: true,
    },
  ],
  terminals: [],
  reasonCodes: [],
};

const employees = [
  {
    id: EMP,
    personnelNumber: '0001',
    fullName: 'Кузнецов Леонид',
    status: 'ACTIVE',
    telegramLinked: true,
    currentPosition: null,
    email: null,
    phone: null,
    telegramUsername: null,
    createdAt: '2026-09-01T00:00:00Z',
  },
  {
    id: EMP2,
    personnelNumber: '0002',
    fullName: 'Сидоров Пётр',
    status: 'ACTIVE',
    telegramLinked: false,
    currentPosition: null,
    email: null,
    phone: null,
    telegramUsername: null,
    createdAt: '2026-09-01T00:00:00Z',
  },
];

const templates = [
  {
    id: TPL_DAY,
    siteId: SITE,
    code: 'DAY',
    name: 'Дневная',
    localStart: '08:00',
    localEnd: '20:00',
    isNight: false,
    isActive: true,
  },
  {
    id: TPL_NIGHT,
    siteId: SITE,
    code: 'NIGHT',
    name: 'Ночная',
    localStart: '20:00',
    localEnd: '08:00',
    isNight: true,
    isActive: true,
  },
];

function version(status: string, assignmentsCount = 1) {
  return {
    id: VERSION,
    siteId: SITE,
    orgUnitId: UNIT,
    periodMonth: '2026-09',
    versionNo: 1,
    revision: 1,
    status,
    createdBy: null,
    submittedAt: null,
    approvedBy: null,
    publishedAt: null,
    supersedesId: null,
    changeReason: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    assignmentsCount,
    deletable: status === 'DRAFT' || status === 'SUPERSEDED',
  };
}

function detail(status: string) {
  return {
    version: version(status),
    assignments: [
      {
        id: ASSIGN,
        scheduleVersionId: VERSION,
        employeeId: EMP,
        templateId: TPL_NIGHT,
        templateCode: 'NIGHT',
        businessDate: '2026-09-05',
        planStartAt: '2026-09-05T17:00:00.000Z',
        planEndAt: '2026-09-06T05:00:00.000Z',
        positionId: null,
        orgUnitId: UNIT,
        teamId: null,
        zoneId: ZONE,
        kind: 'REGULAR',
        status: 'PLANNED',
        acknowledgedAt: null,
      },
    ],
  };
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function mockApi(
  state: {
    status: string;
    created?: boolean;
    revision?: number;
    conflict?: boolean;
    legacyApi?: boolean;
    saveGate?: Promise<void>;
  },
  snapshot: typeof org = org,
  roster = employees,
) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const path = url.pathname + url.search;
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (path === '/admin/org') return json(snapshot);
    if (url.pathname === '/admin/employees/page') {
      const after = url.searchParams.get('after');
      const remaining = roster.filter((employee) => !after || employee.id > after);
      const items = remaining.slice(0, 200);
      return json({
        items,
        total: roster.length,
        nextCursor: remaining.length > 200 ? items.at(-1)?.id : null,
      });
    }
    if (path.startsWith('/admin/schedules/templates')) return json(templates);
    if (path.startsWith('/admin/schedules?')) {
      const list =
        state.status === 'EMPTY' && !state.created
          ? []
          : [version(state.status === 'EMPTY' ? 'DRAFT' : state.status)];
      // Once a draft has been created it is part of the month, like it would be on the server.
      if (state.created) {
        list.unshift({
          ...version('DRAFT'),
          id: 'd0000000-0000-4000-8000-000000000002',
          versionNo: 2,
          supersedesId: null,
        });
      }
      return json(list);
    }
    if (path === '/admin/schedules' && method === 'POST') {
      state.created = true;
      const created = {
        ...version('DRAFT'),
        id: 'd0000000-0000-4000-8000-000000000002',
        versionNo: 2,
        supersedesId: null,
      };
      return json(
        state.legacyApi
          ? Object.fromEntries(Object.entries(created).filter(([key]) => key !== 'revision'))
          : created,
        201,
      );
    }
    if (path === '/admin/schedules/d0000000-0000-4000-8000-000000000002') {
      const d = detail('DRAFT');
      return json({
        ...d,
        version: {
          ...d.version,
          id: 'd0000000-0000-4000-8000-000000000002',
          versionNo: 2,
          revision: state.legacyApi ? 0 : 1,
        },
        assignments: [],
      });
    }
    if (path === `/admin/schedules/${VERSION}`) {
      const result = detail(state.status);
      return json({
        ...result,
        version: state.legacyApi
          ? Object.fromEntries(Object.entries(result.version).filter(([key]) => key !== 'revision'))
          : { ...result.version, revision: state.revision ?? 1 },
      });
    }
    if (path === `/admin/schedules/${VERSION}/assignments` && method === 'PUT') {
      await state.saveGate;
      if (state.conflict) {
        state.revision = 2;
        return json({ code: 'SCHEDULE_REVISION_CONFLICT', message: 'Stale revision' }, 409);
      }
      return json(detail(state.status));
    }
    if (path === `/admin/schedules/${VERSION}/submit`) {
      state.status = 'IN_REVIEW';
      return json(version('IN_REVIEW'));
    }
    if (path === `/admin/schedules/${VERSION}/publish`) {
      state.status = 'PUBLISHED';
      return json(version('PUBLISHED'));
    }
    if (path === `/admin/schedules/${VERSION}/revise`) {
      return json({
        ...version('PUBLISHED'),
        id: 'd0000000-0000-4000-8000-000000000002',
        versionNo: 2,
        supersedesId: VERSION,
      });
    }
    if (path === `/admin/schedules/${VERSION}/acknowledgements`) {
      return json([
        {
          employeeId: EMP,
          fullName: 'Кузнецов Леонид',
          personnelNumber: '0001',
          assignments: 1,
          acknowledged: 0,
          telegramLinked: true,
        },
      ]);
    }
    return json({ code: 'NOT_FOUND', message: path }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const t = messages(currentLocale()).scheduleWorkspace;
const s = messages(currentLocale()).admin.schedule;
function account(actorId = ACTOR) {
  return (
    <NavigationProvider
      actorId={actorId}
      go={() => undefined}
      roles={['ADMIN']}
      grants={[{ role: 'ADMIN', scopeType: 'ENTERPRISE', scopeId: null }]}
    >
      <SchedulePage />
    </NavigationProvider>
  );
}
function admin() {
  return render(account());
}
describe('schedule workspace', () => {
  beforeEach(() => {
    viewport.mobile = false;
    useScheduleDrafts.setState({
      drafts: {},
      baselines: {},
      revisions: {},
      past: {},
      future: {},
      recoveryError: false,
    });
    clearPersistentState();
    setUiState({ 'schedule.month': '2026-09' });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  it('isolates local edits and server reads when the signed-in account changes', async () => {
    const calls = mockApi({ status: 'DRAFT' });
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
    useScheduleDrafts.getState().keep(DRAFT_KEY, local, saved, 1);
    writeSchedulePreset({
      actorId: ACTOR,
      orgUnitId: UNIT,
      month: '2026-09',
      people: [{ id: EMP2, name: 'Private preset person' }],
    });
    const page = admin();
    expect(await screen.findByRole('button', { name: `${s.save} (1)` })).toBeTruthy();
    const reads = calls.filter((call) => call.path === `/admin/schedules/${VERSION}`).length;
    page.rerender(account('f0000000-0000-4000-8000-000000000002'));
    expect(screen.queryByText(/Private preset person/)).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: t.edit }));
    expect(screen.getByRole('button', { name: `${s.save} (0)` }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(
      calls.filter((call) => call.path === `/admin/schedules/${VERSION}`).length,
    ).toBeGreaterThan(reads);
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
    page.rerender(account());
    expect(await screen.findByRole('button', { name: `${s.save} (1)` })).toBeTruthy();
  });

  it('retains unowned legacy edits without opening their content for the current account', async () => {
    mockApi({ status: 'DRAFT' });
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
    useScheduleDrafts.getState().keep(VERSION, local, saved, 1);
    admin();
    expect(await screen.findByText(t.unownedDraft)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: t.edit }));
    expect(screen.getByRole('button', { name: `${s.save} (0)` }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(useScheduleDrafts.getState().drafts[VERSION]).toEqual(local);
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toBeUndefined();
  });

  it('ignores a successful write response after the account changes', async () => {
    let finishSave: () => void = () => undefined;
    const saveGate = new Promise<void>((resolve) => {
      finishSave = () => resolve();
    });
    const calls = mockApi({ status: 'DRAFT', saveGate });
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
    useScheduleDrafts.getState().keep(DRAFT_KEY, local, saved, 1);
    const page = admin();
    fireEvent.click(await screen.findByRole('button', { name: `${s.save} (1)` }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    page.rerender(account('f0000000-0000-4000-8000-000000000002'));
    fireEvent.click(await screen.findByRole('button', { name: t.edit }));
    vi.mocked(notifySuccess).mockClear();
    await act(async () => {
      finishSave();
      await saveGate;
    });
    expect(screen.getByRole('button', { name: `${s.save} (0)` }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it('ignores the old workspace response after switching accounts and returning to its warm cache', async () => {
    let finishSave: () => void = () => undefined;
    const saveGate = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const calls = mockApi({ status: 'DRAFT', saveGate });
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
    useScheduleDrafts.getState().keep(DRAFT_KEY, local, saved, 1);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 300_000, staleTime: 30_000 } },
    });
    const page = renderRaw(account(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    fireEvent.click(await screen.findByRole('button', { name: `${s.save} (1)` }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    page.rerender(account('f0000000-0000-4000-8000-000000000002'));
    await screen.findByRole('button', { name: t.edit });
    page.rerender(account());
    await screen.findByRole('button', { name: `${s.save} (1)` });
    vi.mocked(notifySuccess).mockClear();
    await act(async () => {
      finishSave();
      await saveGate;
    });
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
    expect(notifySuccess).not.toHaveBeenCalled();
    client.clear();
  });

  it('starts with the published zone overview and hides mutation controls for masters', async () => {
    const calls = mockApi({ status: 'PUBLISHED', created: true });
    render(
      <NavigationProvider
        actorId={ACTOR}
        go={() => undefined}
        roles={['SHIFT_MASTER']}
        grants={[{ role: 'SHIFT_MASTER', scopeType: 'ORG_UNIT', scopeId: UNIT }]}
      >
        <SchedulePage />
      </NavigationProvider>,
    );
    expect(await screen.findByText(t.current)).toBeTruthy();
    expect(screen.getByRole('tab', { name: t.zones }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('button', { name: t.edit })).toBeNull();
    expect(screen.queryByRole('button', { name: t.create })).toBeNull();
    expect(screen.queryByRole('button', { name: t.reviewPublish })).toBeNull();
    expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  });
  it('retains selected assignment context when changing grouping and opens the existing editor', async () => {
    mockApi({ status: 'DRAFT' });
    admin();
    fireEvent.click(await screen.findByRole('button', { name: t.edit }));
    while (!screen.queryByRole('button', { name: /Кузнецов Леонид, 05/ })) {
      const previous = screen.getByRole('button', { name: t.previous });
      if (previous.hasAttribute('disabled')) break;
      fireEvent.click(previous);
    }
    const calendar = screen.getByRole('table', { name: t.calendar });
    const rowCount = within(calendar).getAllByRole('row').length;
    const origin = screen.getByRole('button', { name: /Кузнецов Леонид, 05/ });
    fireEvent.click(origin);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(within(calendar).getAllByRole('row', { hidden: true })).toHaveLength(rowCount);
    fireEvent.click(
      screen.getByRole('button', { name: messages(currentLocale()).ui.common.close }),
    );
    await waitFor(() => expect(document.activeElement).toBe(origin));
    fireEvent.mouseDown(screen.getByRole('tab', { name: t.people }), { button: 0, ctrlKey: false });
    const assignment = screen.getByRole('button', { name: /Линия 1, 05/ });
    expect(assignment.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(assignment);
    expect(screen.getByRole('heading', { name: t.wholeAssignment })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.editAssignment }));
    expect(screen.getByRole('combobox', { name: s.employee }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: t.apply }).hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByRole('button', { name: t.cancel })).toHaveLength(1);
  });
  it('offers only supported mobile periods and keeps day navigation usable', async () => {
    viewport.mobile = true;
    mockApi({ status: 'PUBLISHED' });
    admin();
    await screen.findByText(t.current);
    expect(screen.queryByRole('radio', { name: t.month })).toBeNull();
    expect(screen.getByRole('radio', { name: t.day }).getAttribute('aria-checked')).toBe('true');
    const navigation = [
      screen.getByRole('button', { name: t.previous }),
      screen.getByRole('button', { name: t.next }),
    ];
    expect(navigation.some((button) => !button.hasAttribute('disabled'))).toBe(true);
  });
  it('filters the monthly people projection without changing assignments in another zone', async () => {
    mockApi({ status: 'DRAFT' });
    admin();
    fireEvent.click(await screen.findByRole('button', { name: t.edit }));
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const next = setAssignment(saved, {
      employeeId: EMP,
      businessDate: '2026-09-06',
      templateId: TPL_DAY,
      zoneId: EMP2,
      kind: 'EXTRA',
    });
    act(() => useScheduleDrafts.getState().keep(DRAFT_KEY, next, saved, 1));
    fireEvent.click(screen.getByRole('radio', { name: t.month }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: t.people }), { button: 0, ctrlKey: false });
    fireEvent.change(screen.getByRole('combobox', { name: t.zone }), { target: { value: ZONE } });
    expect(screen.getByRole('tabpanel', { name: t.people })).toBeTruthy();
    expect(screen.getByText(t.outsideZone)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Кузнецов Леонид, 2026-09-06/ })).toBeNull();
    expect(gridToItems(useScheduleDrafts.getState().drafts[DRAFT_KEY] ?? { rows: [] })).toEqual(
      gridToItems(next),
    );
    fireEvent.click(screen.getByRole('button', { name: /Кузнецов Леонид, 2026-09-05/ }));
    fireEvent.click(screen.getByRole('button', { name: t.removeAssignment }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('region', { name: t.people })),
    );
    expect(gridToItems(useScheduleDrafts.getState().drafts[DRAFT_KEY] ?? { rows: [] })).toEqual(
      gridToItems(next).filter((item) => item.zoneId !== ZONE),
    );
  });
  it('opens the month as a day/night employee matrix with read-only assignment details', async () => {
    mockApi({ status: 'PUBLISHED' });
    admin();
    await screen.findByRole('tab', { name: t.zones });
    fireEvent.click(screen.getByRole('radio', { name: t.month }));
    expect(screen.queryByRole('tab', { name: t.zones })).toBeNull();
    expect(screen.getByRole('tabpanel', { name: t.people })).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.date })).toBeNull();
    const cell = await screen.findByRole('button', { name: /Кузнецов Леонид, 2026-09-05/ });
    expect(cell.textContent).toBe(messages(currentLocale()).schedule.dayKinds.NIGHT);
    fireEvent.click(cell);
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Линия 1')).toBeTruthy();
    expect(within(sheet).queryByRole('combobox')).toBeNull();
    expect(within(sheet).queryByRole('button', { name: t.apply })).toBeNull();
  });
  it('keeps month mode and its toolbar picker when the selected year changes', async () => {
    mockApi({ status: 'PUBLISHED' });
    admin();
    await screen.findByRole('tab', { name: t.zones });
    fireEvent.click(screen.getByRole('radio', { name: t.month }));
    fireEvent.click(
      screen.getByRole('button', { name: messages(currentLocale()).admin.schedule.month }),
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: messages(currentLocale()).ui.common.calendarYear }),
      { target: { value: '2027' } },
    );
    const january = new Intl.DateTimeFormat(currentLocale(), { month: 'short' }).format(
      new Date(2000, 0, 1),
    );
    fireEvent.click(screen.getByRole('button', { name: january }));
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: t.month }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    );
    expect(
      screen.getByRole('button', { name: messages(currentLocale()).admin.schedule.month })
        .textContent,
    ).toContain('2027');
    expect(screen.queryByRole('tab', { name: t.zones })).toBeNull();
  });
  it('does not create a version automatically when arriving with overview workers', async () => {
    const calls = mockApi({ status: 'PUBLISHED' });
    writeSchedulePreset({
      actorId: ACTOR,
      orgUnitId: UNIT,
      month: '2026-09',
      people: [{ id: EMP2, name: 'Сидоров Пётр' }],
    });
    admin();
    expect(await screen.findByText(t.current)).toBeTruthy();
    expect(screen.getByText(/Сидоров Пётр/)).toBeTruthy();
    expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  });
  it('preserves full-month assignments and metadata when saving an edited cell', async () => {
    const calls = mockApi({ status: 'DRAFT' });
    admin();
    fireEvent.click(await screen.findByRole('button', { name: t.edit }));
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const next = setAssignment(saved, {
      employeeId: EMP2,
      businessDate: '2026-09-25',
      templateId: TPL_DAY,
      zoneId: ZONE,
      kind: 'EXTRA',
      positionId: ZONE,
      teamId: ZONE,
    });
    act(() => useScheduleDrafts.getState().keep(DRAFT_KEY, next, saved, 1));
    fireEvent.click(screen.getByRole('button', { name: `${s.save} (1)` }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
      expectedRevision: 1,
      items: gridToItems(next),
    });
    expect(gridToItems(next)).toHaveLength(2);
  });
  it('offers undo and redo, returning Save to disabled when the edit is undone', async () => {
    mockApi({ status: 'DRAFT' });
    admin();
    fireEvent.click(await screen.findByRole('button', { name: t.edit }));
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    act(() =>
      useScheduleDrafts
        .getState()
        .keep(DRAFT_KEY, setCell(saved, EMP, '2026-09-05', TPL_DAY), saved, 1),
    );
    fireEvent.click(screen.getByRole('button', { name: t.undo }));
    expect(screen.getByRole('button', { name: `${s.save} (0)` }).hasAttribute('disabled')).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: t.redo }));
    expect(screen.getByRole('button', { name: `${s.save} (1)` }).hasAttribute('disabled')).toBe(
      false,
    );
  });
  it('blocks stale local drafts and retains them for recovery', async () => {
    mockApi({ status: 'DRAFT' });
    const old = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const local = setCell(old, EMP, '2026-09-05', '');
    act(() =>
      useScheduleDrafts
        .getState()
        .keep(DRAFT_KEY, local, setCell(old, EMP, '2026-09-05', TPL_DAY), 1),
    );
    admin();
    expect(await screen.findByText(t.stale)).toBeTruthy();
    expect(screen.getByRole('button', { name: `${s.save} (1)` }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
  });
  it('shows concrete publication differences and sends the entered change reason', async () => {
    const calls = mockApi({ status: 'PUBLISHED' });
    admin();
    fireEvent.click(await screen.findByRole('button', { name: t.edit }));
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('PUBLISHED')));
    const next = setCell(saved, EMP, '2026-09-05', TPL_DAY);
    act(() => useScheduleDrafts.getState().keep(DRAFT_KEY, next, saved, 1));
    fireEvent.click(screen.getByRole('button', { name: t.reviewPublish }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(new RegExp(t.nightShift))).toBeTruthy();
    expect(within(dialog).getByText(new RegExp(t.dayShift))).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(t.reason), {
      target: { value: 'Move to the day shift' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: s.publish }));
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/revise'))).toBe(true));
    expect(calls.find((call) => call.path.endsWith('/revise'))?.body).toEqual({
      expectedRevision: 1,
      items: gridToItems(next),
      changeReason: 'Move to the day shift',
    });
  });
});

it('previews a batch before applying it and keeps it local until Save', async () => {
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  clearPersistentState();
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'DRAFT' });
  admin();
  fireEvent.click(await screen.findByRole('button', { name: t.edit }));
  fireEvent.click(screen.getByRole('button', { name: t.add }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Сидоров Пётр' }));
  fireEvent.change(within(dialog).getByLabelText(t.zone), { target: { value: ZONE } });
  fireEvent.change(within(dialog).getByLabelText(t.template), { target: { value: TPL_DAY } });
  fireEvent.click(within(dialog).getByRole('button', { name: t.preview }));
  expect(within(dialog).getByText(`${t.added}: 1`)).toBeTruthy();
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole('button', { name: t.apply }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: `${s.save} (1)` }).hasAttribute('disabled')).toBe(
    false,
  );
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  cleanup();
  vi.unstubAllGlobals();
});

it('preserves unsaved edits when the server version is now in review and blocks publication', async () => {
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  clearPersistentState();
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'IN_REVIEW' });
  const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
  const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
  useScheduleDrafts.getState().keep(DRAFT_KEY, local, saved, 1);
  admin();
  expect(await screen.findByText(t.readOnlyChanges)).toBeTruthy();
  expect(screen.getByRole('button', { name: t.reviewPublish }).hasAttribute('disabled')).toBe(true);
  expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  cleanup();
  vi.unstubAllGlobals();
});

it('offers recovery for a no-op legacy draft after the version enters review', async () => {
  const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
  const legacy = {
    rows: saved.rows.map(({ employeeId, zoneId, cells }) => ({ employeeId, zoneId, cells })),
  };
  useScheduleDrafts.setState({
    drafts: { [DRAFT_KEY]: legacy },
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  clearPersistentState();
  setUiState({ 'schedule.month': '2026-09' });
  mockApi({ status: 'IN_REVIEW' });
  admin();
  expect(await screen.findByText(t.readOnlyChanges)).toBeTruthy();
  expect(screen.getByRole('button', { name: t.discard }).hasAttribute('disabled')).toBe(false);
  expect(screen.getByRole('button', { name: t.reviewPublish }).hasAttribute('disabled')).toBe(true);
  cleanup();
  vi.unstubAllGlobals();
});

it('finds a worker beyond 200 through the paginated batch picker without trimming hidden assignments', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const roster = Array.from({ length: 205 }, (_, index) => ({
    ...employees[0],
    id: `b0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    personnelNumber: `P${index}`,
    fullName: `Roster worker ${index + 1}`,
    status: 'ACTIVE',
    telegramLinked: false,
    currentPosition: null,
    email: null,
    phone: null,
    telegramUsername: null,
    createdAt: '2026-09-01T00:00:00Z',
  }));
  const calls = mockApi({ status: 'DRAFT' }, org, roster);
  admin();
  fireEvent.click(await screen.findByRole('button', { name: t.edit }));
  fireEvent.click(screen.getByRole('button', { name: t.add }));
  const dialog = screen.getByRole('dialog');
  await waitFor(() => expect(within(dialog).getAllByRole('checkbox')).toHaveLength(20));
  fireEvent.click(within(dialog).getByRole('button', { name: t.allPeople }));
  expect(within(dialog).getByText(`${t.selectedPeople}: 20`)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: t.clearPeople }));
  fireEvent.change(within(dialog).getByRole('searchbox', { name: t.workerSearch }), {
    target: { value: 'Roster worker 205' },
  });
  fireEvent.click(await within(dialog).findByRole('checkbox', { name: 'Roster worker 205' }));
  fireEvent.change(within(dialog).getByLabelText(t.zone), { target: { value: ZONE } });
  fireEvent.change(within(dialog).getByLabelText(t.template), { target: { value: TPL_DAY } });
  fireEvent.click(within(dialog).getByRole('button', { name: t.preview }));
  fireEvent.click(within(dialog).getByRole('button', { name: t.apply }));
  fireEvent.click(screen.getByRole('button', { name: `${s.save} (1)` }));
  await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
  expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({
    items: expect.arrayContaining([
      expect.objectContaining({
        employeeId: EMP,
        businessDate: '2026-09-05',
        templateId: TPL_NIGHT,
      }),
      expect.objectContaining({ employeeId: roster[204]?.id, templateId: TPL_DAY }),
    ]),
  });
  cleanup();
  vi.unstubAllGlobals();
});

it('retains a stale draft and its original revision after the server rejects a save', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'DRAFT', conflict: true });
  admin();
  fireEvent.click(await screen.findByRole('button', { name: t.edit }));
  const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
  const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
  act(() => useScheduleDrafts.getState().keep(DRAFT_KEY, local, saved, 1));
  fireEvent.click(screen.getByRole('button', { name: `${s.save} (1)` }));
  await waitFor(() => expect(screen.getAllByText(t.stale).length).toBeGreaterThan(0));
  expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
  expect(useScheduleDrafts.getState().revisions[DRAFT_KEY]).toBe(1);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: `${s.save} (1)` }).hasAttribute('disabled')).toBe(
      true,
    ),
  );
  expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
  expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({ expectedRevision: 1 });
  fireEvent.click(screen.getByRole('button', { name: t.discard }));
  const confirmation = await screen.findByRole('alertdialog');
  fireEvent.click(within(confirmation).getByRole('button', { name: t.discard }));
  await waitFor(() => expect(screen.queryByText(t.stale)).toBeNull());
  expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toBeUndefined();

  cleanup();
  vi.unstubAllGlobals();
});

it('disables lifecycle actions when an identical server grid has a newer revision', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
  useScheduleDrafts
    .getState()
    .keep(DRAFT_KEY, setCell(saved, EMP, '2026-09-05', TPL_DAY), saved, 1);
  useScheduleDrafts.getState().undo(DRAFT_KEY);
  const calls = mockApi({ status: 'DRAFT', revision: 2 });
  admin();
  fireEvent.click(await screen.findByRole('button', { name: t.edit }));
  expect(await screen.findByText(t.stale)).toBeTruthy();
  expect(screen.getByRole('button', { name: s.submit }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: s.deleteVersion }).hasAttribute('disabled')).toBe(true);
  expect(useScheduleDrafts.getState().revisions[DRAFT_KEY]).toBe(1);
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  cleanup();
  vi.unstubAllGlobals();
});

it('keeps a legacy API schedule readable but disables editing during a rolling deployment', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'DRAFT', legacyApi: true });
  admin();
  expect(await screen.findByText(t.revisionUnavailable)).toBeTruthy();
  expect(screen.getByRole('button', { name: t.edit }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: t.month }));
  expect((await screen.findAllByText('Кузнецов Леонид')).length).toBeGreaterThan(0);
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  cleanup();
  vi.unstubAllGlobals();
});

it('accepts a legacy create response and opens the new draft read only', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'EMPTY', legacyApi: true });
  admin();
  fireEvent.click(await screen.findByRole('button', { name: t.create }));
  expect(await screen.findByText(t.revisionUnavailable)).toBeTruthy();
  expect(screen.getByRole('button', { name: t.edit }).hasAttribute('disabled')).toBe(true);
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  expect(
    calls.some((call) => call.path === '/admin/schedules/d0000000-0000-4000-8000-000000000002'),
  ).toBe(true);
  cleanup();
  vi.unstubAllGlobals();
});
