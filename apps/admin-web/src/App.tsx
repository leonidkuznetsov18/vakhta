import { MobileNavigation, MobileNavigationClose } from '@/features/mobile-navigation';
import { MutationActivity } from '@/components/app/query-feedback';
import { useState } from 'react';
import {
  ActivityIcon,
  AlertTriangleIcon,
  BarChart3Icon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  CoinsIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  ScrollTextIcon,
  SendIcon,
  SettingsIcon,
  SunIcon,
  type LucideIcon,
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
import { LoadingState } from '@/shared/ui/loading-state';
import { InfoTip } from '@/components/app/info-tip';
import { UserAvatar } from '@/components/app/avatar';
import { LogoMark } from '@/components/app/logo';
import { MessageEmployeeDialog } from '@/components/app/message-employee';
import { LoginScreen } from './auth/LoginScreen.tsx';
import { ProfilePanel } from './auth/ProfilePanel.tsx';
import { AdminPage } from './admin/AdminPage.tsx';
import { AuditPage } from './audit/AuditPage.tsx';
import { ReportsPage } from './reports/ReportsPage.tsx';
import { BonusPage } from './bonus/BonusPage.tsx';
import { HandoverPage } from './handover/HandoverPage.tsx';
import { IncidentKnowledgePage } from '@/pages/incident-knowledge';
import { IncidentsPage } from './incidents/IncidentsPage.tsx';
import { OperationsPage } from './operations/OperationsPage.tsx';
import { OverviewPage } from './overview/OverviewPage.tsx';
import { useAttention } from './overview/attention.ts';
import { RequestsPage } from './requests/RequestsPage.tsx';
import { SchedulePage } from './schedule/SchedulePage.tsx';
import { useSession } from './auth/useSession.ts';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { SELECTED_TOGGLE } from '@/components/app/page';
import { useNewBuild } from '@/lib/build-check';
import { CompactLanguageSwitcher, LanguageSwitcher, currentLocale } from './i18n.tsx';
import { useAppearance, type Theme } from '@/lib/theme';
import { NavigationProvider, type SectionKey } from './navigation.tsx';
import { useRoute, writeRoute } from '@/lib/route';
import { setUiState } from '@/lib/ui-store';
import { useDocumentTitle } from '@/lib/title';
import { CommandPalette } from '@/components/app/command-palette';
import { FaqButton } from '@/components/app/how-it-works';

const t = messages(currentLocale());

type ActiveKey = SectionKey | 'profile';

const SECTIONS: readonly { key: SectionKey; icon: typeof ActivityIcon }[] = [
  { key: 'overview', icon: LayoutDashboardIcon },
  { key: 'operations', icon: ActivityIcon },
  { key: 'schedule', icon: CalendarDaysIcon },
  { key: 'incidents', icon: AlertTriangleIcon },
  { key: 'incidentKnowledge', icon: ScrollTextIcon },
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
  incidentKnowledge: IncidentKnowledgePage,
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
    handover: data.overdueAcceptances ?? 0,
    requests: data.requestsForMe ?? 0,
  };
}
const EMPTY_ME: MeView = {
  id: '',
  email: '',
  name: '',
  twoFactorEnabled: false,
  image: null,
  roles: [],
  createdAt: '',
};

export function App() {
  const { state, refresh, signOut } = useSession();
  const badges = useBadges(state.status === 'authenticated' ? state.me : null);
  /** The "write to an employee" dialog, reachable from every section. */
  const [writing, setWriting] = useState(false);
  /**
   * The section on screen is the address bar, read rather than copied: a link, the back button and
   * a click in the sidebar all say the same thing, so none of them needs to be kept in step with
   * the others. Only the section is written here; pages with tabs append their own sub-path.
   */
  const { section } = useRoute();
  const active: ActiveKey =
    section in PAGES || section === 'profile' || section === 'overview'
      ? (section as ActiveKey)
      : 'overview';
  const setActive = (key: ActiveKey) => writeRoute(key);
  // Hooks stay above the early returns (React keeps their order between renders). The tab title
  // names the section once signed in; the login screen sets its own.
  useDocumentTitle(
    state.status === 'authenticated'
      ? `${active === 'profile' ? t.admin.auth.profile : t.admin.sections[active]} · ${t.admin.productName}`
      : null,
  );

  // Every hook lives above the early returns: React keeps their order between renders, and a hook
  // placed after them once crashed the panel on sign-in.
  const newBuild = useNewBuild();

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-svh items-center justify-center" aria-busy="true">
        <LoadingState />
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
    <NavigationProvider
      go={(section: SectionKey) => setActive(section)}
      roles={me.roles.map((g) => g.role)}
    >
      <SidebarProvider>
        <MobileNavigation>
          <MessageEmployeeDialog open={writing} onOpenChange={setWriting} />
          <Sidebar collapsible="icon">
            <div
              data-navigation-swipe=""
              className="flex h-full min-h-0 flex-col max-md:touch-pan-y max-md:touch-pinch-zoom"
            >
              <SidebarHeader className="flex-row items-center">
                <MobileNavigationClose />
                {/* The mark is the way home: it opens the overview. Collapsed, it shrinks to the rail's 32 px. */}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-base font-semibold hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                  aria-label={t.admin.sections.overview}
                  onClick={() => setActive('overview')}
                >
                  <LogoMark className="size-9 group-data-[collapsible=icon]:size-8" />
                  <span className="truncate group-data-[collapsible=icon]:hidden">
                    {t.admin.productName}
                  </span>
                </button>
              </SidebarHeader>
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupContent>
                    {/* Above the sections and outside them: writing to somebody is not a place in the
                    panel, it is something done from wherever the reader already is. */}
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          tooltip={t.admin.message.title}
                          onClick={() => setWriting(true)}
                        >
                          <SendIcon aria-hidden="true" />
                          <span>{t.admin.message.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                    <SidebarSeparator className="my-2" />
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
                            <SidebarMenuBadge className="tabular-nums">
                              {badges[key]}
                            </SidebarMenuBadge>
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
                      size="lg"
                      className="h-16 gap-3 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
                      isActive={active === 'profile'}
                      tooltip={t.admin.auth.profile}
                      onClick={() => setActive('profile')}
                    >
                      {/* The menu button forces 16px on every svg; the avatar opts out. Collapsed, only the avatar stays, filling the rail. */}
                      <UserAvatar
                        name={me.name}
                        email={me.email}
                        image={me.image}
                        className="size-12! shrink-0 group-data-[collapsible=icon]:size-8!"
                      />
                      <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
                        <span className="truncate text-base font-medium">
                          {me.name || me.email}
                        </span>
                        {primaryRole ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {t.roles[primaryRole]}
                          </span>
                        ) : null}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={t.admin.auth.signOut}
                      onClick={() => void signOut()}
                    >
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
                <ThemeSwitcher />
                {/* Collapsed rail: the current language and theme as single icons; a click cycles them. */}
                <div className="hidden flex-col items-center gap-1 group-data-[collapsible=icon]:flex">
                  <CompactLanguageSwitcher />
                  <CompactThemeSwitcher />
                </div>
                {version ? (
                  <div className="px-2 text-xs text-muted-foreground tabular-nums group-data-[collapsible=icon]:hidden">
                    {t.ui.common.version} {version}
                  </div>
                ) : null}
              </SidebarFooter>
            </div>
          </Sidebar>
          <SidebarInset>
            {newBuild && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50 px-4 py-2 text-sm dark:bg-amber-950/40">
                <span>{t.ui.common.newBuild}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => location.reload()}>
                  {t.ui.common.newBuildReload}
                </Button>
              </div>
            )}
            <header
              data-navigation-swipe=""
              className="sticky top-0 z-20 flex min-h-14 touch-pan-y touch-pinch-zoom items-center gap-2 border-b bg-background px-3 py-2 md:static md:h-14 md:px-4 md:py-0"
            >
              <SidebarTrigger aria-label={t.ui.common.menu} />
              <h1 className="min-w-0 text-lg font-semibold max-md:text-base max-md:leading-snug">
                {title}
              </h1>
              <div className="ml-auto flex items-center gap-2">
                {active !== 'profile' && (
                  <FaqButton guide={active === 'incidentKnowledge' ? 'incidents' : active} />
                )}
                <CommandPalette
                  sections={SECTIONS}
                  onSection={(key) => setActive(key)}
                  canSeeEmployees={me.roles.some((g) =>
                    ['ADMIN', 'HR', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER'].includes(g.role),
                  )}
                  canAdminister={me.roles.some((g) => g.role === 'ADMIN')}
                  onTarget={(target) => {
                    if (target.openKey && target.openId) {
                      setUiState({ [target.openKey]: target.openId });
                    }
                    writeRoute(target.section, target.sub);
                    setActive(target.section);
                  }}
                  onEmployee={(emp) => {
                    // The employees tab reads its open row from the store, so the card opens on arrival.
                    setUiState({ 'employees.openId': emp.id });
                    writeRoute('administration', 'employees');
                    setActive('administration');
                  }}
                />
              </div>
            </header>
            <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
              <MutationActivity />
              {active === 'profile' ? (
                <ProfilePanel me={me} onChanged={() => void refresh()} />
              ) : active === 'overview' ? (
                <OverviewPage me={me} />
              ) : Page ? (
                <Page />
              ) : null}
            </main>
          </SidebarInset>
        </MobileNavigation>
      </SidebarProvider>
    </NavigationProvider>
  );
}

/** Light / dark / system in the sidebar footer; the same choice as in the profile. */
const THEME_ORDER: Theme[] = ['light', 'dark', 'system'];
const THEME_ICONS: Record<Theme, LucideIcon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
};

/** One button for the collapsed rail: the current theme's icon, a click moves to the next theme. */
function CompactThemeSwitcher() {
  const t = messages(currentLocale());
  const appearance = useAppearance();
  const Icon = THEME_ICONS[appearance.theme];
  const next = THEME_ORDER[(THEME_ORDER.indexOf(appearance.theme) + 1) % THEME_ORDER.length]!;
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="size-8"
      aria-label={`${t.ui.common.theme}: ${t.ui.common.themes[appearance.theme]}`}
      title={`${t.ui.common.themes[appearance.theme]} → ${t.ui.common.themes[next]}`}
      onClick={() => appearance.set({ theme: next })}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}

function ThemeSwitcher() {
  const t = messages(currentLocale());
  const appearance = useAppearance();
  const options: { key: Theme; icon: LucideIcon }[] = [
    { key: 'light', icon: SunIcon },
    { key: 'dark', icon: MoonIcon },
    { key: 'system', icon: MonitorIcon },
  ];
  return (
    <div
      role="group"
      aria-label={t.ui.common.theme}
      className="flex gap-1 group-data-[collapsible=icon]:hidden"
    >
      {options.map(({ key, icon: Icon }) => (
        <Button
          key={key}
          type="button"
          size="sm"
          variant="outline"
          aria-pressed={appearance.theme === key}
          aria-label={t.ui.common.themes[key]}
          title={t.ui.common.themes[key]}
          className={cn('flex-1', appearance.theme === key && SELECTED_TOGGLE)}
          onClick={() => appearance.set({ theme: key })}
        >
          <Icon aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
}
