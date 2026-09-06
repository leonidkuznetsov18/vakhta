import { useState } from 'react';
import {
  ActivityIcon,
  LayoutDashboardIcon,
  AlertTriangleIcon,
  BarChart3Icon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  CoinsIcon,
  InboxIcon,
  LogOutIcon,
  ScrollTextIcon,
  SettingsIcon,
  UserIcon,
} from 'lucide-react';
import type { MeView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { InfoTip } from '@/components/app/info-tip';
import { LogoMark } from '@/components/app/logo';
import { LoginScreen } from './auth/LoginScreen.tsx';
import { ProfilePanel } from './auth/ProfilePanel.tsx';
import { AdminPage } from './admin/AdminPage.tsx';
import { AuditPage } from './audit/AuditPage.tsx';
import { ReportsPage } from './reports/ReportsPage.tsx';
import { BonusPage } from './bonus/BonusPage.tsx';
import { HandoverPage } from './handover/HandoverPage.tsx';
import { IncidentsPage } from './incidents/IncidentsPage.tsx';
import { OperationsPage } from './operations/OperationsPage.tsx';
import { OverviewPage } from './overview/OverviewPage.tsx';
import { useAttention } from './overview/attention.ts';
import { RequestsPage } from './requests/RequestsPage.tsx';
import { SchedulePage } from './schedule/SchedulePage.tsx';
import { useSession } from './auth/useSession.ts';
import { LanguageSwitcher, currentLocale } from './i18n.tsx';
import { NavigationProvider, type SectionKey } from './navigation.tsx';
import { readRoute, writeRoute } from '@/lib/route';
import { useEffect } from 'react';
import { CommandPalette } from '@/components/app/command-palette';

const t = messages(currentLocale());

type ActiveKey = SectionKey | 'profile';

const SECTIONS: readonly { key: SectionKey; icon: typeof ActivityIcon }[] = [
  { key: 'overview', icon: LayoutDashboardIcon },
  { key: 'operations', icon: ActivityIcon },
  { key: 'schedule', icon: CalendarDaysIcon },
  { key: 'incidents', icon: AlertTriangleIcon },
  { key: 'handover', icon: ClipboardCheckIcon },
  { key: 'requests', icon: InboxIcon },
  { key: 'bonus', icon: CoinsIcon },
  { key: 'reports', icon: BarChart3Icon },
  { key: 'administration', icon: SettingsIcon },
  { key: 'audit', icon: ScrollTextIcon },
];

/** Which role to show under the name when a user has several: the widest wins. */
const ROLE_ORDER = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'HR',
  'PLANNER',
  'SHIFT_MASTER',
  'CLEANLINESS_CONTROLLER',
  'ACCOUNTANT',
  'AUDITOR',
] as const;

const PAGES: Partial<Record<SectionKey, () => React.ReactElement>> = {
  operations: OperationsPage,
  schedule: SchedulePage,
  incidents: IncidentsPage,
  handover: HandoverPage,
  requests: RequestsPage,
  bonus: BonusPage,
  reports: ReportsPage,
  administration: AdminPage,
  audit: AuditPage,
};

/**
 * Panel shell: the nine sections of spec 9.1 behind a better-auth session in a shadcn sidebar;
 * the profile lets the user enable TOTP. Section state lives in memory, there is no router.
 */
/** Counts on the sidebar entries: open incidents, pending handovers, requests on my step. */
function useBadges(me: MeView | null): Partial<Record<SectionKey, number>> {
  const { data } = useAttention(me ?? EMPTY_ME, me ? 60_000 : 3_600_000);
  if (!me) return {};
  return {
    incidents: data.openIncidents ?? 0,
    handover: (data.disputes ?? 0) + (data.overdueAcceptances ?? 0),
    requests: data.requestsForMe ?? 0,
  };
}
const EMPTY_ME: MeView = {
  id: '',
  email: '',
  name: '',
  twoFactorEnabled: false,
  roles: [],
  createdAt: '',
};

export function App() {
  const { state, refresh, signOut } = useSession();
  const badges = useBadges(state.status === 'authenticated' ? state.me : null);
  const [active, setActive] = useState<ActiveKey>(() => {
    const { section } = readRoute();
    return section in PAGES || section === 'profile' || section === 'overview'
      ? (section as ActiveKey)
      : 'overview';
  });
  useEffect(() => {
    if (state.status !== 'authenticated') return;
    // Only the section is written here; pages with tabs append their own sub-path.
    const { section, sub } = readRoute();
    writeRoute(active, section === active ? sub : undefined);
    const onChange = () => {
      const next = readRoute().section;
      if (next in PAGES || next === 'profile' || next === 'overview') setActive(next as ActiveKey);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [active, state.status]);

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-svh items-center justify-center" aria-busy="true">
        <Spinner />
      </main>
    );
  }
  if (state.status === 'anonymous') {
    return <LoginScreen offline={state.offline} onSignedIn={() => void refresh()} />;
  }

  const { me } = state;
  const primaryRole = ROLE_ORDER.find((r) => me.roles.some((g) => g.role === r)) ?? null;
  const title = active === 'profile' ? t.admin.auth.profile : t.admin.sections[active];
  const version = import.meta.env['VITE_APP_VERSION'];
  const Page = active === 'profile' || active === 'overview' ? null : PAGES[active];

  return (
    <NavigationProvider go={(section: SectionKey) => setActive(section)}>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-1 py-1 text-base font-semibold group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <LogoMark letter={t.admin.productName.charAt(0)} />
              <span className="truncate group-data-[collapsible=icon]:hidden">
                {t.admin.productName}
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu aria-label={t.ui.common.menu}>
                  {SECTIONS.map(({ key, icon: Icon }) => (
                    <SidebarMenuItem key={key}>
                      <SidebarMenuButton
                        isActive={key === active}
                        tooltip={t.admin.sections[key]}
                        aria-current={key === active ? 'page' : undefined}
                        onClick={() => setActive(key)}
                      >
                        <Icon aria-hidden="true" />
                        <span>{t.admin.sections[key]}</span>
                      </SidebarMenuButton>
                      {badges[key] ? (
                        <SidebarMenuBadge className="tabular-nums">{badges[key]}</SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === 'profile'}
                  tooltip={t.admin.auth.profile}
                  onClick={() => setActive('profile')}
                >
                  <UserIcon aria-hidden="true" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate">{me.email}</span>
                    {primaryRole ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {t.roles[primaryRole]}
                      </span>
                    ) : null}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip={t.admin.auth.signOut} onClick={() => void signOut()}>
                  <LogOutIcon aria-hidden="true" />
                  <span>{t.admin.auth.signOut}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarSeparator />
            <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
              <LanguageSwitcher className="flex-1" />
              <InfoTip text={t.ui.hints.language} />
            </div>
            {version ? (
              <div className="px-2 text-xs text-muted-foreground tabular-nums group-data-[collapsible=icon]:hidden">
                {t.ui.common.version} {version}
              </div>
            ) : null}
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger aria-label={t.ui.common.menu} />
            <h1 className="text-lg font-semibold">{title}</h1>
            <div className="ml-auto">
              <CommandPalette
                sections={SECTIONS}
                onSection={(key) => setActive(key)}
                canSeeEmployees={me.roles.some((g) =>
                  ['ADMIN', 'HR', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER'].includes(g.role),
                )}
                onEmployee={(emp) => {
                  // The employees tab reads its open row from storage, so the card opens on arrival.
                  try {
                    localStorage.setItem('vakhta.ui.employees.openId', JSON.stringify(emp.id));
                  } catch {
                    // Storage unavailable: the section still opens.
                  }
                  writeRoute('administration', 'employees');
                  setActive('administration');
                }}
              />
            </div>
          </header>
          <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
            {active === 'profile' ? (
              <ProfilePanel me={me} onChanged={() => void refresh()} />
            ) : active === 'overview' ? (
              <OverviewPage me={me} />
            ) : Page ? (
              <Page />
            ) : null}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </NavigationProvider>
  );
}
