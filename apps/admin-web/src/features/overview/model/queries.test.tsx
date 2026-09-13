import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, renderHook, waitFor, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type * as ApiModule from '@/api';
import type { MeView, OverviewSnapshot } from '@vakhta/contracts';
import { render } from '@/test-utils';
import { keys } from '@/lib/query';
import { OverviewPage } from '@/overview/OverviewPage';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NavigationProvider } from '@/navigation';
import { writeRoute } from '@/lib/route';
import { clearPersistentState, setUiState, uiState } from '@/lib/ui-store';
import { useAttention } from './queries';

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
function page(user = me) {
  return render(
    <TooltipProvider>
      <NavigationProvider go={(section) => writeRoute(section)}>
        <OverviewPage me={user} />
      </NavigationProvider>
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
  writeRoute('overview');
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
    expect(location.hash).toBe('#/handover/report-0');
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
    expect(location.hash).toBe('#/administration/terminals');
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
          notArrivedPeople: [
            {
              employeeId: 'a0000000-0000-4000-8000-0000000000b1',
              fullName: 'Boris',
              planStartAt: '2026-09-13T05:00:00.000Z',
              zoneName: 'Lathe 1',
            },
            {
              employeeId: 'a0000000-0000-4000-8000-0000000000b2',
              fullName: 'Olha',
              planStartAt: '2026-09-13T05:00:00.000Z',
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
});
