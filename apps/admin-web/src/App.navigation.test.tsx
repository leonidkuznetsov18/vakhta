import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { App, createPanelRouter } from './app/index';
import { TooltipProvider } from '@/components/ui/tooltip';
import { registerUnsaved } from '@/lib/unsaved';
import { setUiState, uiState } from '@/lib/ui-store';

const t = messages('ru');
const { mobile, sessionStatus } = vi.hoisted(() => ({
  mobile: { value: true },
  sessionStatus: { value: 'authenticated' },
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile.value }));
vi.mock('./auth/useSession.ts', () => ({
  useSession: () => ({
    state: {
      status: sessionStatus.value,
      me: {
        id: 'qa',
        name: 'QA',
        email: 'qa@example.test',
        image: null,
        roles: [{ role: 'ADMIN' }],
      },
    },
    refresh: vi.fn(),
    signOut: vi.fn(),
  }),
}));
vi.mock('@/features/overview', () => ({ useAttention: () => ({ data: {} }) }));
vi.mock('@/lib/build-check', () => ({ useNewBuild: () => false }));
vi.mock('@/lib/theme', () => ({ useAppearance: () => ({ theme: 'light', set: vi.fn() }) }));
vi.mock('@/shared/ui/query-activity', () => ({ QueryActivity: () => null }));
vi.mock('@/components/app/query-feedback', () => ({ MutationActivity: () => null }));
vi.mock('@/components/app/how-it-works', () => ({ FaqButton: () => null }));
vi.mock('@/features/employee-communications', () => ({
  CommunicationProvider: ({ children }: { children: React.ReactNode }) => children,
  CommunicationWorkspace: () => null,
  CommunicationLauncher: () => null,
}));
vi.mock('@/pages/overview', () => ({
  OverviewPage: () => <div data-testid="overview-page">Overview content</div>,
}));
vi.mock('@/features/schedule-management', () => ({
  ScheduleWorkspace: () => <div data-testid="schedule-page">Schedule content</div>,
}));
vi.mock('./operations/OperationsPage.tsx', () => ({
  OperationsPage: () => <div data-testid="operations-page">Operations content</div>,
}));
vi.mock('./admin/AdminPage.tsx', () => ({
  AdminPage: () => <div data-testid="administration-page">Administration content</div>,
}));
vi.mock('./audit/AuditPage.tsx', () => ({ AuditPage: () => null }));
vi.mock('./reports/ReportsPage.tsx', () => ({ ReportsPage: () => null }));
vi.mock('./bonus/BonusPage.tsx', () => ({ BonusPage: () => null }));
vi.mock('./handover/HandoverPage.tsx', () => ({ HandoverPage: () => null }));
vi.mock('./incidents/IncidentsPage.tsx', () => ({ IncidentsPage: () => null }));
vi.mock('./requests/RequestsPage.tsx', () => ({ RequestsPage: () => null }));
vi.mock('@/pages/photo-library', () => ({ PhotoLibraryPage: () => null }));
vi.mock('./auth/LoginScreen.tsx', () => ({
  LoginScreen: () => <div data-testid="login">Login</div>,
}));
vi.mock('./auth/ProfilePanel.tsx', () => ({ ProfilePanel: () => null }));
vi.mock('@/components/app/command-palette', () => ({
  CommandPalette: ({
    onTarget,
  }: {
    onTarget: (target: { section: 'administration'; sub: string }) => void;
  }) => (
    <button onClick={() => onTarget({ section: 'administration', sub: 'terminals' })}>
      Open terminals
    </button>
  ),
}));

let router: ReturnType<typeof createPanelRouter>;
beforeEach(() => {
  mobile.value = true;
  sessionStatus.value = 'authenticated';
  history.replaceState(null, '', '#/overview');
});
afterEach(() => {
  cleanup();
  router?.history.destroy();
  vi.restoreAllMocks();
});
async function mount(hash?: string) {
  if (hash) history.replaceState(null, '', hash);
  router = createPanelRouter();
  await act(async () => {
    render(
      <TooltipProvider>
        <App router={router} />
      </TooltipProvider>,
    );
  });
  await screen.findByRole('heading', { level: 1 });
}
function menu() {
  return screen.getByRole('list', { name: t.ui.common.menu });
}
function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: t.ui.common.menu }));
}
function assertPage(section: 'overview' | 'schedule' | 'operations' | 'administration') {
  expect(location.hash).toBe(`#/${section}`);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.admin.sections[section]);
  expect(screen.getByTestId(`${section}-page`)).toBeTruthy();
  expect(document.querySelectorAll('[data-testid$="-page"]')).toHaveLength(1);
  expect(
    within(menu())
      .getByRole('link', { name: t.admin.sections[section] })
      .getAttribute('aria-current'),
  ).toBe('page');
  expect(menu().querySelectorAll('[aria-current="page"]')).toHaveLength(1);
}
it('keeps mobile page, URL and reopened sidebar selection in step over repeated transitions', async () => {
  await mount();
  openMenu();
  assertPage('overview');
  for (const section of ['schedule', 'overview', 'operations', 'schedule', 'overview'] as const) {
    await act(async () => {
      fireEvent.click(within(menu()).getByRole('link', { name: t.admin.sections[section] }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    openMenu();
    assertPage(section);
  }
});
it('preserves the exact destination from quick navigation', async () => {
  await mount();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Open terminals' }));
  });
  expect(location.hash).toBe('#/administration/terminals');
  expect(screen.getByTestId('administration-page')).toBeTruthy();
});
it('keeps the current mobile menu and page when leaving an unsaved form is canceled', async () => {
  await mount();
  openMenu();
  const unregister = registerUnsaved(() => true);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    await act(async () => {
      fireEvent.click(within(menu()).getByRole('link', { name: t.admin.sections.schedule }));
    });
    expect(screen.queryByRole('dialog')).not.toBeNull();
    assertPage('overview');
    expect(confirm).toHaveBeenCalledTimes(1);
  } finally {
    unregister();
  }
});
it.each([false, true])(
  'keeps selection and page synchronized through Back and Forward (mobile: %s)',
  async (isMobile) => {
    mobile.value = isMobile;
    await mount();
    await act(async () => {
      await router.navigate({ to: '/schedule' });
    });
    await act(async () => {
      await router.navigate({ to: '/operations/{-$id}' });
    });
    if (isMobile) openMenu();
    assertPage('operations');
    await act(async () => {
      history.back();
    });
    await waitFor(() => expect(screen.getByTestId('schedule-page')).toBeTruthy());
    if (isMobile) openMenu();
    assertPage('schedule');
    await act(async () => {
      history.forward();
    });
    await waitFor(() => expect(screen.getByTestId('operations-page')).toBeTruthy());
    if (isMobile) openMenu();
    assertPage('operations');
  },
);
it('blocks browser Back without changing the page and permits it after confirmation', async () => {
  await mount();
  await act(async () => {
    await router.navigate({ to: '/schedule' });
  });
  const unregister = registerUnsaved(() => true);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    await act(async () => {
      history.back();
    });
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(location.hash).toBe('#/schedule'));
    expect(screen.getByTestId('schedule-page')).toBeTruthy();
    confirm.mockReturnValue(true);
    await act(async () => {
      history.back();
    });
    await waitFor(() => expect(screen.getByTestId('overview-page')).toBeTruthy());
    expect(confirm).toHaveBeenCalledTimes(2);
  } finally {
    unregister();
  }
});
it('uses the latest route after rapid transitions and a fresh mount', async () => {
  await mount();
  await act(async () => {
    await Promise.all([
      router.navigate({ to: '/schedule' }),
      router.navigate({ to: '/overview' }),
      router.navigate({ to: '/operations/{-$id}' }),
      router.navigate({ to: '/schedule' }),
    ]);
  });
  openMenu();
  assertPage('schedule');
  cleanup();
  router.history.destroy();
  await mount();
  openMenu();
  assertPage('schedule');
});
it('retains native modified-link behavior without changing the page or closing the menu', async () => {
  await mount();
  openMenu();
  const link = within(menu()).getByRole('link', { name: t.admin.sections.schedule });
  expect(new URL(link.getAttribute('href') ?? '', location.href).hash).toBe('#/schedule');
  let prevented = true;
  document.addEventListener(
    'click',
    (event) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    },
    { once: true },
  );
  fireEvent.click(link, { ctrlKey: true });
  expect(prevented).toBe(false);
  assertPage('overview');
});
it('closes the mobile menu when selecting the current page without adding history', async () => {
  await mount();
  openMenu();
  const entries = history.length;
  await act(async () => {
    fireEvent.click(within(menu()).getByRole('link', { name: t.admin.sections.overview }));
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(history.length).toBe(entries);
  expect(location.hash).toBe('#/overview');
});
it.each(['#/', '#/not-a-page'])('canonicalizes %s to Overview', async (hash) => {
  await mount(hash);
  openMenu();
  assertPage('overview');
});
it('normalizes retired incident links and their visibility filters', async () => {
  setUiState({ 'incidents.scope': 'open', 'incidents.period': 'day', 'incidents.siteId': 'other' });
  await mount('#/incidentKnowledge/incident-id');
  await waitFor(() => expect(location.hash).toBe('#/incidents/incident-id'));
  expect(uiState('incidents.scope')).toBe('all');
  expect(uiState('incidents.period')).toBe('all');
  expect(uiState('incidents.siteId')).toBe('');
});
it('replaces tabs and record selections without growing section history', async () => {
  await mount();
  await act(async () => {
    await router.navigate({
      to: '/administration/{-$tab}/{-$detail}',
      params: { tab: 'terminals' },
    });
  });
  const length = history.length;
  await act(async () => {
    await router.navigate({
      to: '/administration/{-$tab}/{-$detail}',
      params: { tab: 'employees', detail: 'employee / one' },
      replace: true,
    });
  });
  expect(location.hash).toBe('#/administration/employees/employee%20%2F%20one');
  expect(history.length).toBe(length);
  await act(async () => {
    history.back();
  });
  await waitFor(() => expect(screen.getByTestId('overview-page')).toBeTruthy());
});
it.each([
  ['#/administration/invalid', '#/administration/employees'],
  ['#/audit/invalid', '#/audit/audit'],
])('canonicalizes invalid tabs: %s', async (source, destination) => {
  await mount(source);
  await waitFor(() => expect(location.hash).toBe(destination));
});

it.each(['loading', 'anonymous'])(
  'keeps protected routes behind the %s session gate',
  async (status) => {
    sessionStatus.value = status;
    history.replaceState(null, '', '#/schedule');
    router = createPanelRouter();
    await act(async () => {
      render(
        <TooltipProvider>
          <App router={router} />
        </TooltipProvider>,
      );
    });
    if (status === 'anonymous') expect(await screen.findByTestId('login')).toBeTruthy();
    else expect(document.querySelector('main[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByTestId('schedule-page')).toBeNull();
    expect(screen.queryByRole('list', { name: t.ui.common.menu })).toBeNull();
  },
);

it('redirects checklist rule links into the catalog and preserves Back', async () => {
  const definitionId = '90000000-0000-4000-8000-000000000001';
  setUiState({ 'search.checklists': 'unrelated search', 'checklists.createFor': 'position' });
  await mount('#/overview');
  await act(async () => {
    await router.navigate({
      to: '/administration/{-$tab}/{-$detail}',
      params: { tab: 'checklists', detail: definitionId },
    });
  });
  await waitFor(() => expect(location.hash).toBe('#/administration/checklists'));
  expect(uiState('checklists.open')).toBe(definitionId);
  expect(uiState('checklists.editRules')).toBe(definitionId);
  expect(uiState('search.checklists')).toBe('');
  expect(uiState('checklists.createFor')).toBeNull();
  await act(async () => router.history.back());
  await waitFor(() => expect(location.hash).toBe('#/overview'));
});
