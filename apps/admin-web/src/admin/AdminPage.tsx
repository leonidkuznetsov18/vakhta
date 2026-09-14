import { ChecklistPhotoRules } from '@/features/checklist-photo-rules';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon } from 'lucide-react';
import { ProfilePage, restoreEmployeeList } from '@/features/employee-profile';
import { writeSchedulePreset } from '@/features/schedule-management';
import { useRoute } from '@/lib/route';
import { useSession } from '@/auth/useSession';
import { messages } from '@vakhta/i18n';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QueryFeedback } from '@/components/app/query-feedback';
import { HowItWorks } from '@/components/app/how-it-works';
import { ChecklistsTab } from './ChecklistsTab.tsx';
import { DirectoriesTab } from './DirectoriesTab.tsx';
import { EmployeesTab, PositionPanel } from './EmployeesTab.tsx';
import { TerminalsTab } from './TerminalsTab.tsx';
import { UsersTab } from './UsersTab.tsx';
import { currentLocale } from '../i18n.tsx';
import { useOrg } from '@/lib/org';
import { useRouteSub } from '@/lib/route';

const t = messages(currentLocale()).admin.administration;
type Tab = keyof typeof t.tabs;
const TABS = Object.keys(t.tabs) as Tab[];

/** "Administration" section: tabs per spec 9.1 over one shared snapshot of the directories. */
export function AdminPage() {
  const [tab, setTab] = useRouteSub<Tab>('administration', TABS, 'employees');
  const { org, queryState } = useOrg();
  const route = useRoute();
  const { state: session } = useSession();
  if (route.sub === 'employees' && route.detail)
    return (
      <ProfilePage
        employeeId={route.detail}
        renderWorkEditor={(profile) =>
          org ? (
            <PositionPanel
              employee={profile.employee}
              org={org}
              onAssigned={() => {
                void queryState.refetch();
              }}
            />
          ) : (
            <QueryFeedback query={queryState} />
          )
        }
        onOpenSchedule={(profile) => {
          writeSchedulePreset({
            actorId: session.status === 'authenticated' ? session.me.id : '',
            orgUnitId: profile.work.unit?.id ?? null,
            month: profile.schedule.month,
            people: [{ id: profile.employee.id, name: profile.employee.fullName }],
          });
          location.hash = '#/schedule';
        }}
      />
    );

  if (route.section === 'administration' && route.sub === 'checklists' && route.detail)
    return (
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4">
        <Button variant="outline" className="self-start" onClick={() => setTab('checklists')}>
          <ArrowLeftIcon aria-hidden="true" />
          {t.tabs.checklists}
        </Button>
        <ChecklistPhotoRules key={route.detail} definitionId={route.detail} initialMode="edit" />
      </div>
    );

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
      <TabsList>
        {TABS.map((key) => (
          <TabsTrigger key={key} value={key}>
            {t.tabs[key]}
          </TabsTrigger>
        ))}
      </TabsList>
      <HowItWorks guide={tab} key={tab} />
      <QueryFeedback query={queryState} />
      {org ? (
        <>
          <TabsContent value="employees">
            <div ref={restoreEmployeeList}>
              <EmployeesTab org={org} />
            </div>
          </TabsContent>
          <TabsContent value="users">
            <UsersTab org={org} />
          </TabsContent>
          <TabsContent value="directories">
            <DirectoriesTab org={org} />
          </TabsContent>
          <TabsContent value="terminals">
            <TerminalsTab org={org} />
          </TabsContent>
          <TabsContent value="checklists">
            <ChecklistsTab org={org} />
          </TabsContent>
        </>
      ) : null}
    </Tabs>
  );
}
