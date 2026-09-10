import { messages } from '@vakhta/i18n';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { Feedback } from '@/components/app/feedback';
import { HowItWorks } from '@/components/app/how-it-works';
import { readError } from '../errors.ts';
import { ChecklistsTab } from './ChecklistsTab.tsx';
import { DirectoriesTab } from './DirectoriesTab.tsx';
import { EmployeesTab } from './EmployeesTab.tsx';
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
  const { org, error: failed } = useOrg();
  const error = readError(failed);

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
      <Feedback error={error} notice={null} />
      {!org && !error ? <Spinner /> : null}
      {org ? (
        <>
          <TabsContent value="employees">
            <EmployeesTab org={org} />
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
