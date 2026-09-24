import { tenantConfig } from '@/shared/config/tenant';
import { QueryActivity } from '@/shared/ui/query-activity';
import { MobileNavigation, MobileNavigationClose } from '@/features/mobile-navigation';
import {
  ActivityIcon,
  AlertTriangleIcon,
  BarChart3Icon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  CoinsIcon,
  InboxIcon,
  ImagesIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  ScrollTextIcon,
  SettingsIcon,
  SunIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';
import { MAINTENANCE_VIEWERS, TenantModule } from '@vakhta/domain';
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
import {
  CommunicationProvider,
  CommunicationWorkspace,
  CommunicationLauncher,
} from '@/features/employee-communications';
import { LoginScreen } from '@/auth/LoginScreen.tsx';
import { useAttention } from '@/features/overview';
import { useSession } from '@/auth/useSession.ts';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { SELECTED_TOGGLE } from '@/components/app/page';
import { useNewBuild } from '@/lib/build-check';
import { CompactLanguageSwitcher, LanguageSwitcher, currentLocale } from '@/i18n.tsx';
import { useAppearance, type Theme } from '@/lib/theme';
import { NavigationProvider, type SectionKey } from '@/navigation.tsx';
import { Link, Outlet, useBlocker, useMatches, useNavigate } from '@tanstack/react-router';
import { confirmLeave } from '@/lib/unsaved';
import { navigationOptions } from '../router/navigation-options';
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
  { key: 'handover', icon: ClipboardCheckIcon },
  { key: 'photoLibrary', icon: ImagesIcon },
  { key: 'requests', icon: InboxIcon },
  { key: 'bonus', icon: CoinsIcon },
  { key: 'maintenance', icon: WrenchIcon },
  { key: 'reports', icon: BarChart3Icon },
  { key: 'administration', icon: SettingsIcon },
  { key: 'audit', icon: ScrollTextIcon },
];

/** Sections limited to some roles; the others are open to every panel user. */
const SECTION_ROLES: Partial<Record<SectionKey, readonly string[]>> = {
  photoLibrary: [
    'ADMIN',
    'PRODUCTION_HEAD',
    'SHIFT_MASTER',
    'CLEANLINESS_CONTROLLER',
    'HR',
    'AUDITOR',
  ],
  maintenance: MAINTENANCE_VIEWERS,
};

/** Sections of a tenant module; without a tenant config (single-tenant mode) every module is on. */
const SECTION_MODULES: Partial<Record<SectionKey, TenantModule>> = {
  maintenance: TenantModule.MAINTENANCE,
};

function moduleOn(key: SectionKey): boolean {
  const module = SECTION_MODULES[key];
  const modules = tenantConfig()?.modules;
  return !module || !modules || modules.includes(module);
}

/** Which role to show under the name when a user has several: the widest wins. */
const ROLE_ORDER = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'HR',
  'PLANNER',
  'CHIEF_MECHANIC',
  'SHIFT_MASTER',
  'CLEANLINESS_CONTROLLER',
  'ACCOUNTANT',
  'AUDITOR',
] as const;

/**
 * Panel shell: the nine sections of spec 9.1 behind a better-auth session in a shadcn sidebar;
 * the profile lets the user enable TOTP. The URL owns the selected section.
 */
/** Counts on the sidebar entries: open incidents, pending handovers, requests on my step. */
function useBadges(me: MeView | null): Partial<Record<SectionKey, number>> {
  const { data } = useAttention(me ?? EMPTY_ME, me ? 60_000 : 3_600_000);
  if (!me) return {};
  return {
    incidents: data.openIncidents ?? 0,
    handover: data.pendingHandovers ?? 0,
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

export function PanelShell() {
  const { state, refresh, signOut } = useSession();
  const badges = useBadges(state.status === 'authenticated' ? state.me : null);
  const active = useMatches({
    select: (matches) => matches.at(-1)?.staticData.section ?? 'overview',
  });
  const navigate = useNavigate();
  const go = (section: ActiveKey, sub?: string) => {
    void navigate({
      ...navigationOptions(section, sub),
      replace: section === active,
      resetScroll: section !== active,
    });
  };
  useBlocker({
    shouldBlockFn: ({ current, next }) => current.pathname !== next.pathname && !confirmLeave(),
    enableBeforeUnload: false, // The shared form registry already owns beforeunload.
  });
  // Hooks stay above the early returns (React keeps their order between renders). The tab title
  // names the section once signed in; the login screen sets its own.
  useDocumentTitle(
    state.status === 'authenticated'
      ? `${active === 'profile' ? t.admin.auth.profile : t.admin.sections[active]} · ${tenantConfig()?.displayName ?? t.admin.productName}`
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
  const myRoles = new Set<string>(me.roles.map(({ role }) => role));
  const visibleSections = SECTIONS.filter(({ key }) => {
    const allowed = SECTION_ROLES[key];
    const permitted = !allowed || allowed.some((role) => myRoles.has(role));
    return permitted && moduleOn(key);
  });
  const primaryRole = ROLE_ORDER.find((r) => me.roles.some((g) => g.role === r)) ?? null;
  const title = active === 'profile' ? t.admin.auth.profile : t.admin.sections[active];
  const version = import.meta.env['VITE_APP_VERSION'];

  return (
    <NavigationProvider
      key={me.id}
      actorId={me.id}
      go={go}
      roles={me.roles.map((g) => g.role)}
      grants={me.roles}
    >
      <CommunicationProvider>
        <SidebarProvider>
          <MobileNavigation>
            <CommunicationWorkspace />
            <Sidebar collapsible="icon">
              <div
                data-navigation-swipe=""
                className="flex h-full min-h-0 flex-col max-md:touch-pan-y max-md:touch-pinch-zoom"
              >
                <SidebarHeader className="flex-row items-center">
                  <MobileNavigationClose />
                  {/* The mark is the way home: it opens the overview. Collapsed, it shrinks to the rail's 32 px. */}
                  <Link
                    to="/overview"
                    replace={active === 'overview'}
                    className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-base font-semibold hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                    aria-label={t.admin.sections.overview}
                  >
                    <LogoMark className="size-9 group-data-[collapsible=icon]:size-8" />
                    <span className="truncate group-data-[collapsible=icon]:hidden">
                      {tenantConfig()?.displayName ?? t.admin.productName}
                    </span>
                  </Link>
                </SidebarHeader>
                <SidebarContent>
                  <SidebarGroup>
                    <SidebarGroupContent>
                      {/* Above the sections and outside them: writing to somebody is not a place in the
                    panel, it is something done from wherever the reader already is. */}
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <CommunicationLauncher />
                        </SidebarMenuItem>
                      </SidebarMenu>
                      <SidebarSeparator className="my-2" />
                      <SidebarMenu aria-label={t.ui.common.menu}>
                        {visibleSections.map(({ key, icon: Icon }) => (
                          <SidebarMenuItem key={key}>
                            <SidebarMenuButton asChild tooltip={t.admin.sections[key]}>
                              <Link
                                {...navigationOptions(key)}
                                replace={key === active}
                                activeOptions={{ includeSearch: false }}
                                activeProps={{ 'data-active': true }}
                              >
                                <Icon aria-hidden="true" />
                                <span>{t.admin.sections[key]}</span>
                              </Link>
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
                        asChild
                        size="lg"
                        className="h-16 gap-3 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
                        tooltip={t.admin.auth.profile}
                      >
                        <Link
                          to="/profile"
                          replace={active === 'profile'}
                          activeProps={{ 'data-active': true }}
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
                        </Link>
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
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => location.reload()}
                  >
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
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <CommunicationLauncher compact />
                  <QueryActivity />
                  {active !== 'profile' && <FaqButton guide={active} />}
                  <CommandPalette
                    sections={visibleSections}
                    onSection={(key) => go(key)}
                    canSeeEmployees={me.roles.some((g) =>
                      ['ADMIN', 'HR', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER'].includes(
                        g.role,
                      ),
                    )}
                    canAdminister={me.roles.some((g) => g.role === 'ADMIN')}
                    onTarget={(target) => {
                      go(target.section, target.sub);
                    }}
                    onEmployee={(emp) => {
                      go('administration', `employees/${emp.id}`);
                    }}
                  />
                </div>
              </header>
              <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
                <Outlet />
              </div>
            </SidebarInset>
          </MobileNavigation>
        </SidebarProvider>
      </CommunicationProvider>
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
