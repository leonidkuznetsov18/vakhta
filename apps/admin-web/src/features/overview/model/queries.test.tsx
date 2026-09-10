import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, renderHook, waitFor, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type * as ApiModule from '@/api';
import type { MeView } from '@vakhta/contracts';
import { render } from '@/test-utils';
import { keys } from '@/lib/query';
import { OverviewPage } from '@/overview/OverviewPage';
import { messages } from '@vakhta/i18n';
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
}));
vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  shiftsApi: { list: api.shifts },
  incidentsApi: { list: api.incidents },
  handoversApi: { list: api.handovers },
  requestsApi: { list: api.requests, overtime: api.overtime },
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
  it('does not render all-clear when a required queue failed', async () => {
    api.handovers.mockRejectedValue(new Error('Unavailable'));
    render(<OverviewPage me={me} />);
    await screen.findByRole('alert');
    expect(screen.queryByText(messages(currentLocale()).admin.overview.allClear)).toBeNull();
  });
  it('opens the pending checklist row and clears filters that could hide it', async () => {
    api.handovers.mockResolvedValue(pending);
    setUiState({
      'handover.date': '2026-09-09',
      'handover.siteId': 'other',
      'search.handover': 'old',
    });
    render(
      <TooltipProvider>
        <NavigationProvider go={(section) => writeRoute(section)}>
          <OverviewPage me={me} />
        </NavigationProvider>
      </TooltipProvider>,
    );
    const label = messages(currentLocale()).admin.overview.overdueAcceptances;
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^6 ${label}`) }));
    expect(location.hash).toBe('#/handover/report-0');
    expect(uiState('handover.scope')).toBe('pending');
    expect(uiState('handover.date')).toBe('');
    expect(uiState('handover.siteId')).toBe('');
    expect(uiState('search.handover')).toBe('');
  });
  it('preserves the terminals tab when the app navigates to administration', async () => {
    api.org.mockResolvedValue({ terminals: [{ id: 'terminal', status: 'ACTIVE', paired: false }] });
    render(
      <TooltipProvider>
        <NavigationProvider go={(section) => writeRoute(section)}>
          <OverviewPage me={me} />
        </NavigationProvider>
      </TooltipProvider>,
    );
    const label = messages(currentLocale()).admin.overview.unpairedTerminals;
    fireEvent.click(await screen.findByRole('button', { name: `1 ${label}` }));
    expect(location.hash).toBe('#/administration/terminals');
  });
});
