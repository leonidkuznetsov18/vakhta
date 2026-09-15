import { createRootRoute, createRoute, redirect, Navigate } from '@tanstack/react-router';
import { PanelShell } from '../ui/panel-shell';
import { useSession } from '@/auth/useSession';
import { ProfilePanel } from '@/auth/ProfilePanel';
import { OverviewPage } from '@/pages/overview';
import { OperationsPage } from '@/operations/OperationsPage';
import { ScheduleWorkspace } from '@/features/schedule-management';
import { IncidentsPage } from '@/incidents/IncidentsPage';
import { HandoverPage } from '@/handover/HandoverPage';
import { PhotoLibraryPage } from '@/pages/photo-library';
import { RequestsPage } from '@/requests/RequestsPage';
import { BonusPage } from '@/bonus/BonusPage';
import { ReportsPage } from '@/reports/ReportsPage';
import { AdminPage } from '@/admin/AdminPage';
import { AuditPage } from '@/audit/AuditPage';
import { setUiState } from '@/lib/ui-store';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { z } from 'zod';

function OverviewRoute() {
  const { state } = useSession();
  return state.status === 'authenticated' ? <OverviewPage me={state.me} /> : null;
}
function ProfileRoute() {
  const { state, refresh } = useSession();
  return state.status === 'authenticated' ? (
    <ProfilePanel me={state.me} onChanged={() => void refresh()} />
  ) : null;
}
const root = createRootRoute({
  component: PanelShell,
  notFoundComponent: () => <Navigate to="/overview" replace />,
});
const index = createRoute({
  getParentRoute: () => root,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/overview', replace: true });
  },
});
const overview = createRoute({
  getParentRoute: () => root,
  path: '/overview',
  component: OverviewRoute,
  staticData: { section: 'overview' },
});
const profile = createRoute({
  getParentRoute: () => root,
  path: '/profile',
  component: ProfileRoute,
  staticData: { section: 'profile' },
});
const operations = createRoute({
  getParentRoute: () => root,
  path: '/operations/{-$id}',
  component: OperationsPage,
  staticData: { section: 'operations' },
});
const schedule = createRoute({
  getParentRoute: () => root,
  path: '/schedule',
  component: ScheduleWorkspace,
  staticData: { section: 'schedule' },
});
const incidents = createRoute({
  getParentRoute: () => root,
  path: '/incidents/{-$id}',
  component: IncidentsPage,
  staticData: { section: 'incidents' },
});
const statistics = createRoute({
  getParentRoute: () => root,
  path: '/incidents/statistics',
  component: IncidentsPage,
  staticData: { section: 'incidents' },
  validateSearch: z.object({ queueId: z.string().optional().catch(undefined) }),
});
const handover = createRoute({
  getParentRoute: () => root,
  path: '/handover/{-$id}',
  component: HandoverPage,
  staticData: { section: 'handover' },
});
const photos = createRoute({
  getParentRoute: () => root,
  path: '/photoLibrary',
  component: PhotoLibraryPage,
  staticData: { section: 'photoLibrary' },
});
const requests = createRoute({
  getParentRoute: () => root,
  path: '/requests/{-$id}',
  component: RequestsPage,
  staticData: { section: 'requests' },
});
const bonus = createRoute({
  getParentRoute: () => root,
  path: '/bonus',
  component: BonusPage,
  staticData: { section: 'bonus' },
});
const reports = createRoute({
  getParentRoute: () => root,
  path: '/reports',
  component: ReportsPage,
  staticData: { section: 'reports' },
});
const administration = createRoute({
  getParentRoute: () => root,
  path: '/administration/{-$tab}/{-$detail}',
  component: AdminPage,
  staticData: { section: 'administration' },
  beforeLoad: ({ params }) => {
    if (
      params.tab &&
      !Object.hasOwn(messages(currentLocale()).admin.administration.tabs, params.tab)
    )
      throw redirect({
        to: '/administration/{-$tab}/{-$detail}',
        params: { tab: 'employees', detail: undefined },
        replace: true,
      });
  },
});
const audit = createRoute({
  getParentRoute: () => root,
  path: '/audit/{-$tab}',
  component: AuditPage,
  staticData: { section: 'audit' },
  beforeLoad: ({ params }) => {
    if (params.tab && !['audit', 'events'].includes(params.tab))
      throw redirect({ to: '/audit/{-$tab}', params: { tab: 'audit' }, replace: true });
  },
});
const legacyIncidents = createRoute({
  getParentRoute: () => root,
  path: '/incidentKnowledge/{-$id}',
  beforeLoad: ({ params }) => {
    setUiState({ 'incidents.scope': 'all', 'incidents.period': 'all', 'incidents.siteId': '' });
    throw redirect({ to: '/incidents/{-$id}', params: { id: params.id }, replace: true });
  },
});
export const routeTree = root.addChildren([
  index,
  overview,
  profile,
  operations,
  schedule,
  incidents,
  statistics,
  handover,
  photos,
  requests,
  bonus,
  reports,
  administration,
  audit,
  legacyIncidents,
]);
