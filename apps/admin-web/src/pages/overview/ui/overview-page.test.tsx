import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, renderHook, waitFor, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type * as ApiModule from '@/api';
import type { ActiveShiftView, MeView, OverviewSnapshot } from '@vakhta/contracts';
import { render } from '@/test-utils';
import { keys } from '@/lib/query';
import { OverviewPage } from '@/pages/overview';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NavigationProvider, type SectionKey } from '@/navigation';
import { clearPersistentState, setUiState, uiState } from '@/lib/ui-store';
import { useAttention } from '@/features/overview';
import { ShiftPeriod } from '@vakhta/domain';

const api = vi.hoisted(() => ({
  shifts: vi.fn(),
  incidents: vi.fn(),
  handovers: vi.fn(),
  requests: vi.fn(),
  overtime: vi.fn(),
  employees: vi.fn(),
  org: vi.fn(),
  snapshot: vi.fn(),
  events: vi.fn(),
}));
vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  shiftsApi: { list: api.shifts, streamUrl: () => '/s' },
  incidentsApi: { list: api.incidents, streamUrl: () => '/i' },
  handoversApi: { list: api.handovers, streamUrl: () => '/h' },
  requestsApi: { list: api.requests, overtime: api.overtime, streamUrl: () => '/r' },
  overviewApi: { snapshot: api.snapshot, events: api.events },
  employeesApi: { list: api.employees },
  orgApi: { snapshot: api.org },
}));
const me: MeView = {
  id: 'qa',
  email: 'qa@example.com',
  name: 'QA',
  twoFactorEnabled: false,
  image: null,
  roles: [
    {
      id: 'grant',
      grantedAt: '2026-09-10T00:00:00Z',
      role: 'ADMIN',
      scopeType: 'ENTERPRISE',
      scopeId: null,
    },
  ],
  createdAt: '2026-09-10T00:00:00Z',
};
const pending = Array.from({ length: 6 }, (_, n) => ({
  id: `report-${n}`,
  status: 'SUBMITTED',
  submittedByName: 'Worker',
  zoneName: null,
  acceptDeadlineAt: '2026-09-10T19:00:00Z',
  overdue: false,
}));
const c = messages(currentLocale()).overviewCenter;
function snapshot(overrides: Partial<OverviewSnapshot> = {}): OverviewSnapshot {
  return {
    generatedAt: '2026-09-13T08:45:00.000Z',
    lateGraceMinutes: 10,
    downtimeEscalationMinutes: 15,
    options: { sites: [{ id: SITE, name: 'Plant 1' }], orgUnits: [] },
    selection: { siteId: null, orgUnitId: null },
    contexts: [],
    staffing: {
      planned: 3,
      present: 2,
      notArrived: 0,
      expected: 1,
      unscheduled: 0,
      presentPeople: [],
      expectedPeople: [],
      notArrivedPeople: [],
      unscheduledPeople: [],
      oldestNotArrivedSince: null,
      businessDate: '2026-09-13',
    },
    downtime: { zoneMinutes: 0, personMinutes: 0, incidents: 0, topReason: null, byZone: [] },
    timeToAction: {
      reported: 0,
      acknowledged: 0,
      medianMinutes: null,
      slaMet: 0,
      slaMissed: 0,
      awaiting: 0,
      awaitingBreached: 0,
    },
    handover: { clean: 0, decided: 0, disputed: 0, pending: 0 },
    terminals: [],
    zones: [],
    setup: { unlinkedEmployees: 0, unpairedTerminals: 0 },
    ...overrides,
  };
}
const SITE = 'a0000000-0000-4000-8000-000000000001';
/** The focusable avatar stack next to a people count. */
function stackBeside(label: HTMLElement): HTMLElement {
  const stack = label.parentElement?.querySelector<HTMLElement>('[tabindex="0"]');
  if (!stack) throw new Error('no avatar stack beside the label');
  return stack;
}
function page(user = me, go?: (section: SectionKey, sub?: string) => void) {
  return render(
    <TooltipProvider>
      {go ? (
        <NavigationProvider go={go}>
          <OverviewPage me={user} />
        </NavigationProvider>
      ) : (
        <OverviewPage me={user} />
      )}
    </TooltipProvider>,
  );
}
function mount(user = me) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useAttention(user), { wrapper }), client };
}
beforeEach(() => {
  vi.clearAllMocks();
  clearPersistentState();
  history.replaceState(null, '', '#/overview');
  for (const fn of [
    api.shifts,
    api.incidents,
    api.handovers,
    api.requests,
    api.overtime,
    api.employees,
  ])
    fn.mockResolvedValue([]);
  api.org.mockResolvedValue({ terminals: [] });
  api.snapshot.mockResolvedValue(snapshot());
  api.events.mockResolvedValue([]);
});
afterEach(cleanup);

describe('overview query integration', () => {
  it('requests the pending queue without date restrictions and reports all six not-yet-overdue checklists', async () => {
    api.handovers.mockResolvedValue(pending);
    const { result } = mount();
    await waitFor(() => expect(result.current.data.pendingHandovers).toBe(6));
    expect(api.handovers).toHaveBeenCalledWith({ scope: 'pending' });
    expect(api.shifts).toHaveBeenCalledWith({ scope: 'ALL' });
    expect(api.incidents).toHaveBeenCalledWith({ scope: 'open' });
    expect(api.requests).toHaveBeenCalledWith({ scope: 'inbox' });
    expect(api.overtime).toHaveBeenCalledWith('pending');
    expect(result.current.incomplete).toBe(false);
  });
  it('updates immediately when the handover page updates the shared cache after a decision', async () => {
    api.handovers.mockResolvedValue(pending);
    const { result, client } = mount();
    await waitFor(() => expect(result.current.data.pendingHandovers).toBe(6));
    act(() => {
      client.setQueryData(keys.handovers({ scope: 'pending' }), []);
    });
    await waitFor(() => expect(result.current.data.pendingHandovers).toBe(0));
    expect(api.handovers).toHaveBeenCalledTimes(1);
  });
  it('shows a failed source as unknown while preserving successful source counts', async () => {
    api.handovers.mockRejectedValue(new Error('Unavailable'));
    const { result } = mount();
    await waitFor(() => expect(result.current.queryState.isError).toBe(true));
    expect(result.current.data.pendingHandovers).toBeNull();
    expect(result.current.data.onShift).toBe(0);
    expect(result.current.incomplete).toBe(true);
  });
  it('does not request restricted operations queues for HR', async () => {
    const { result } = mount({
      ...me,
      roles: [
        {
          id: 'grant',
          grantedAt: '2026-09-10T00:00:00Z',
          role: 'HR',
          scopeType: 'ENTERPRISE',
          scopeId: null,
        },
      ],
    });
    await waitFor(() => expect(result.current.data.requestsForMe).toBe(0));
    expect(api.shifts).not.toHaveBeenCalled();
    expect(api.incidents).not.toHaveBeenCalled();
    expect(api.handovers).not.toHaveBeenCalled();
    expect(api.overtime).not.toHaveBeenCalled();
    expect(result.current.data.pendingHandovers).toBeNull();
    expect(result.current.incomplete).toBe(false);
  });
  it('does not fetch any overview source before authentication', () => {
    const { result } = mount({ ...me, id: '', roles: [] });
    expect(result.current.data.refreshedAt).toBeNull();
    for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
  });
  it('does not render all-clear when a required queue failed (AC-011)', async () => {
    api.handovers.mockRejectedValue(new Error('Unavailable'));
    page();
    const alert = await screen.findByText(new RegExp(c.items.pendingHandovers));
    expect(alert.closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByText(c.allClear)).toBeNull();
  });
  it('opens the pending checklist row and clears filters that could hide it (AC-013)', async () => {
    api.handovers.mockResolvedValue(pending);
    setUiState({
      'handover.date': '2026-09-09',
      'handover.siteId': 'other',
      'search.handover': 'old',
    });
    page();
    fireEvent.click(await screen.findByRole('button', { name: `6 ${c.items.pendingHandovers}` }));
    await waitFor(() => expect(location.hash).toBe('#/handover/report-0'));
    expect(uiState('handover.scope')).toBe('pending');
    expect(uiState('handover.date')).toBe('');
    expect(uiState('handover.siteId')).toBe('');
    expect(uiState('search.handover')).toBe('');
  });
  it('carries the selected site into the destination filters (AC-008)', async () => {
    api.handovers.mockResolvedValue(pending);
    setUiState({ 'overview.selection': { siteId: SITE, orgUnitId: null } });
    page();
    fireEvent.click(await screen.findByRole('button', { name: `6 ${c.items.pendingHandovers}` }));
    expect(uiState('handover.siteId')).toBe(SITE);
    expect(api.snapshot).toHaveBeenCalledWith({ siteId: SITE });
  });
  it('orders a critical offline terminal before checklists and keeps setup debt apart (AC-009, AC-020)', async () => {
    api.handovers.mockResolvedValue(pending);
    api.snapshot.mockResolvedValue(
      snapshot({
        terminals: [
          {
            id: 'a0000000-0000-4000-8000-0000000000aa',
            siteId: SITE,
            name: 'Gate 1',
            connectivity: 'OFFLINE',
            lastSeenAt: '2026-09-13T08:39:00.000Z',
            critical: true,
          },
        ],
        setup: { unlinkedEmployees: 93, unpairedTerminals: 1 },
      }),
    );
    page();
    const terminal = await screen.findByRole('button', { name: `1 ${c.items.terminalsOffline}` });
    const checklists = screen.getByRole('button', { name: `6 ${c.items.pendingHandovers}` });
    expect(
      terminal.compareDocumentPosition(checklists) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(terminal.textContent).toContain(c.tiers.critical);
    expect(checklists.textContent).toContain(c.tiers.warning);
    expect(screen.getByRole('button', { name: `93 ${c.unlinkedEmployees}` })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: new RegExp(`^93 ${c.items.notArrived}`) }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `1 ${c.unpairedTerminals}` }));
    await waitFor(() => expect(location.hash).toBe('#/administration/terminals'));
  });
  it('does not show a shift line or empty health on a day off', async () => {
    const window = {
      templateId: 'a0000000-0000-4000-8000-0000000000d2',
      code: 'NIGHT',
      name: 'Ночная смена',
      period: ShiftPeriod.NIGHT,
      businessDate: '2026-09-13',
      startsAt: '2026-09-13T17:00:00.000Z',
      endsAt: '2026-09-14T05:00:00.000Z',
      closesAt: '2026-09-14T07:00:00.000Z',
      staffed: false,
    };
    api.snapshot.mockResolvedValue(
      snapshot({
        contexts: [
          {
            siteId: SITE,
            siteName: 'Plant 1',
            timezone: 'Europe/Kyiv',
            current: window,
            closingPrevious: null,
            next: null,
          },
        ],
        staffing: { ...snapshot().staffing!, planned: 0, present: 0, expected: 0 },
      }),
    );
    page();
    await screen.findByText(new RegExp(c.checked.split('{')[0]!));
    expect(screen.queryByText(/Ночная смена/)).toBeNull();
    expect(screen.queryByText(c.healthTitle)).toBeNull();
    expect(screen.queryByText(c.noPlan)).toBeNull();
  });
  it('shows retry instead of zero when the shift snapshot fails (AC-019)', async () => {
    api.snapshot.mockRejectedValue(new Error('Unavailable'));
    page();
    expect((await screen.findAllByRole('button', { name: c.retry })).length).toBeGreaterThan(0);
    expect(screen.queryByText(c.noPlan)).toBeNull();
    expect(screen.queryByText(format(c.staffingValue, { present: 0, planned: 0 }))).toBeNull();
  });
  it('states staffing with its numerator, denominator and the people not recorded (AC-014)', async () => {
    api.snapshot.mockResolvedValue(
      snapshot({
        staffing: {
          planned: 43,
          present: 40,
          notArrived: 2,
          expected: 1,
          unscheduled: 1,
          presentPeople: [],
          expectedPeople: [],
          notArrivedPeople: [
            {
              employeeId: 'a0000000-0000-4000-8000-0000000000b1',
              fullName: 'Boris',
              personnelNumber: 'T-B',
              orgUnitName: 'Lathe shop',
              planStartAt: '2026-09-13T05:00:00.000Z',
              planEndAt: '2026-09-13T17:00:00.000Z',
              zoneName: 'Lathe 1',
            },
            {
              employeeId: 'a0000000-0000-4000-8000-0000000000b2',
              fullName: 'Olha',
              personnelNumber: 'T-O',
              orgUnitName: 'Lathe shop',
              planStartAt: '2026-09-13T05:00:00.000Z',
              planEndAt: '2026-09-13T17:00:00.000Z',
              zoneName: null,
            },
          ],
          unscheduledPeople: [],
          oldestNotArrivedSince: '2026-09-13T05:00:00.000Z',
          businessDate: '2026-09-13',
        },
      }),
    );
    page();
    expect(
      await screen.findByText(format(c.staffingValue, { present: 40, planned: 43 })),
    ).toBeTruthy();
    expect(screen.getByText(format(c.notArrivedCount, { count: 2 }))).toBeTruthy();
    expect(screen.getByText(format(c.unscheduledCount, { count: 1 }))).toBeTruthy();
    expect(screen.getByRole('button', { name: `2 ${c.items.notArrived}` })).toBeTruthy();
  });

  it('names who is missing in the staffing tile and in a zone, by face and tooltip', async () => {
    const olha = {
      employeeId: 'a0000000-0000-4000-8000-0000000000b2',
      fullName: 'Olha Koval',
      planStartAt: '2026-09-13T05:00:00.000Z',
      zoneName: 'Lathe 1',
    };
    const boris = {
      ...olha,
      employeeId: 'a0000000-0000-4000-8000-0000000000b1',
      fullName: 'Boris Melnyk',
      planStartAt: null,
    };
    api.snapshot.mockResolvedValue(
      snapshot({
        staffing: {
          planned: 2,
          present: 1,
          notArrived: 1,
          expected: 0,
          unscheduled: 0,
          presentPeople: [boris],
          expectedPeople: [],
          notArrivedPeople: [
            {
              ...olha,
              personnelNumber: 'T-O',
              orgUnitName: 'Lathe shop',
              planEndAt: '2026-09-13T17:00:00.000Z',
            },
          ],
          unscheduledPeople: [],
          oldestNotArrivedSince: olha.planStartAt,
          businessDate: '2026-09-13',
        },
        zones: [
          {
            zoneId: 'a0000000-0000-4000-8000-0000000000c1',
            zoneName: 'Lathe 1',
            orgUnitId: 'a0000000-0000-4000-8000-0000000000c2',
            orgUnitName: 'Shop',
            siteId: SITE,
            status: 'UNDERSTAFFED',
            planned: 2,
            present: 1,
            since: null,
            presentPeople: [boris],
            missingPeople: [olha],
          },
        ],
      }),
    );
    page();
    fireEvent.focus(stackBeside(await screen.findByText(format(c.notArrivedCount, { count: 1 }))));
    expect((await screen.findAllByText(/Olha Koval/)).length).toBeGreaterThan(0);
    expect(stackBeside(screen.getByText(format(c.zoneMissingCount, { count: 1 })))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lathe 1' })).toBeTruthy();
  });
});

it.each(['unit-a', null])(
  'hands only the selected %s workers to Schedule before navigating',
  async (orgUnitId) => {
    const person = {
      id: 'shift-a',
      employeeId: 'person-a',
      fullName: 'Ada',
      personnelNumber: '01',
      orgUnitId,
      orgUnitName: orgUnitId ? 'Production A' : null,
      businessDate: '2026-09-30',
      assignmentId: null,
      state: 'WORKING',
      endedAt: null,
      startedAt: '2026-09-30T05:00:00Z',
      stateSince: '2026-09-30T05:00:00Z',
      zoneName: null,
      zoneId: null,
      stateMinutes: 0,
    } satisfies Partial<ActiveShiftView>;
    api.shifts.mockResolvedValue([
      person,
      {
        ...person,
        id: 'shift-other',
        employeeId: 'other',
        fullName: 'Other',
        orgUnitId: 'unit-b',
        orgUnitName: 'Production B',
      },
      {
        ...person,
        id: 'shift-c',
        employeeId: 'person-c',
        fullName: 'Cora',
        businessDate: '2026-10-01',
      },
    ]);
    setUiState({ 'schedule.orgUnitId': 'remembered-unit' });
    const navigate = vi.fn((_section: SectionKey) => {
      expect(uiState('schedule.preset')).toEqual({
        actorId: me.id,
        orgUnitId,
        month: '2026-09',
        people: [
          { id: 'person-a', name: 'Ada' },
          { id: 'person-c', name: 'Cora' },
        ],
      });
      expect(uiState('schedule.month')).toBe('2026-09');
      expect(uiState('schedule.orgUnitId')).toBe(orgUnitId ?? 'remembered-unit');
    });
    page(me, navigate);
    const label = format(c.unscheduledUnit, {
      unit: orgUnitId ? 'Production A' : messages(currentLocale()).admin.overview.noUnit,
    });
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(label) }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith('schedule');
  },
);
