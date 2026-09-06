import { useState } from 'react';
import {
  ActivityIcon,
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
import { RequestsPage } from './requests/RequestsPage.tsx';
import { SchedulePage } from './schedule/SchedulePage.tsx';
import { useSession } from './auth/useSession.ts';
import { LanguageSwitcher, currentLocale } from './i18n.tsx';
import { NavigationProvider, type SectionKey } from './navigation.tsx';

const t = messages(currentLocale());

type ActiveKey = SectionKey | 'profile';

const SECTIONS: readonly { key: SectionKey; icon: typeof ActivityIcon }[] = [
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

const PAGES: Record<SectionKey, () => React.ReactElement> = {
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
export function App() {
  const { state, refresh, signOut } = useSession();
  const [active, setActive] = useState<ActiveKey>('operations');

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
  const title = active === 'profile' ? t.admin.auth.profile : t.admin.sections[active];
  const version = import.meta.env['VITE_APP_VERSION'];
  const Page = active === 'profile' ? null : PAGES[active];

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
                  <span className="truncate">{me.email}</span>
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
          </header>
          <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            {active === 'profile' ? (
              <ProfilePanel me={me} onChanged={() => void refresh()} />
            ) : Page ? (
              <Page />
            ) : null}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </NavigationProvider>
  );
}
