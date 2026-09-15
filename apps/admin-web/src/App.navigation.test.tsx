import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { App } from './App';
import { TooltipProvider } from '@/components/ui/tooltip';
import { registerUnsaved } from '@/lib/unsaved';
import { writeRoute } from '@/lib/route';

const t = messages('ru');
const { mobile } = vi.hoisted(() => ({ mobile: { value: true } }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile.value }));
vi.mock('./auth/useSession.ts', () => ({
  useSession: () => ({
    state: {
      status: 'authenticated',
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
vi.mock('./auth/LoginScreen.tsx', () => ({ LoginScreen: () => null }));
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

beforeEach(() => {
  mobile.value = true;
  history.replaceState(null, '', '#/overview');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mount() {
  render(
    <TooltipProvider>
      <App />
    </TooltipProvider>,
  );
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

it('keeps mobile page, URL and reopened sidebar selection in step over repeated transitions', () => {
  mount();
  openMenu();
  assertPage('overview');
  for (const section of ['schedule', 'overview', 'operations', 'schedule', 'overview'] as const) {
    fireEvent.click(within(menu()).getByRole('link', { name: t.admin.sections[section] }));
    expect(screen.queryByRole('dialog')).toBeNull();
    openMenu();
    assertPage(section);
  }
});
it('preserves the exact destination from quick navigation', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Open terminals' }));
  expect(location.hash).toBe('#/administration/terminals');
  expect(screen.getByTestId('administration-page')).toBeTruthy();
});
it('keeps the current mobile menu and page when leaving an unsaved form is canceled', () => {
  mount();
  openMenu();
  const unregister = registerUnsaved(() => true);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    fireEvent.click(within(menu()).getByRole('link', { name: t.admin.sections.schedule }));
    expect(screen.queryByRole('dialog')).not.toBeNull();
    assertPage('overview');
  } finally {
    unregister();
  }
});
it.each([false, true])(
  'keeps selection and page synchronized through Back and Forward (mobile: %s)',
  async (isMobile) => {
    mobile.value = isMobile;
    mount();
    if (isMobile) openMenu();
    act(() => writeRoute('schedule'));
    act(() => writeRoute('operations'));
    assertPage('operations');
    await act(async () => {
      history.back();
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    });
    await waitFor(() => assertPage('schedule'));
    await act(async () => {
      history.forward();
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    });
    await waitFor(() => assertPage('operations'));
  },
);

it('uses the latest route after rapid transitions and a fresh mount', () => {
  mount();
  act(() => {
    writeRoute('schedule');
    writeRoute('overview');
    writeRoute('operations');
    writeRoute('schedule');
  });
  openMenu();
  assertPage('schedule');
  cleanup();
  mount();
  openMenu();
  assertPage('schedule');
});
it('retains native modified-link behavior without changing the page or closing the menu', () => {
  mount();
  openMenu();
  const link = within(menu()).getByRole('link', { name: t.admin.sections.schedule });
  expect(link.getAttribute('href')).toBe('#/schedule');
  // Stop jsdom's unsupported new-tab default after verifying the application did not intercept it.
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
it('closes the mobile menu when selecting the current page without adding a history entry', () => {
  mount();
  openMenu();
  const entries = history.length;
  fireEvent.click(within(menu()).getByRole('link', { name: t.admin.sections.overview }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(history.length).toBe(entries);
  expect(location.hash).toBe('#/overview');
});
