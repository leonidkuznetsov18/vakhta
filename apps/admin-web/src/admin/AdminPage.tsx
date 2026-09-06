import { useCallback, useEffect, useState } from 'react';
import type { OrgSnapshot } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { Feedback } from '@/components/app/feedback';
import { orgApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { ChecklistsTab } from './ChecklistsTab.tsx';
import { DirectoriesTab } from './DirectoriesTab.tsx';
import { EmployeesTab } from './EmployeesTab.tsx';
import { TerminalsTab } from './TerminalsTab.tsx';
import { UsersTab } from './UsersTab.tsx';
import { currentLocale } from '../i18n.tsx';
import { useRouteSub } from '@/lib/route';

const t = messages(currentLocale()).admin.administration;
type Tab = keyof typeof t.tabs;
const TABS = Object.keys(t.tabs) as Tab[];

/** "Administration" section: tabs per spec 9.1 over one shared snapshot of the directories. */
export function AdminPage() {
  const [tab, setTab] = useRouteSub<Tab>('administration', TABS, 'employees');
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setOrg(await orgApi.snapshot());
  }, []);

  useEffect(() => {
    reload().catch((e: unknown) => setError(describeError(e)));
  }, [reload]);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
      <TabsList>
        {TABS.map((key) => (
          <TabsTrigger key={key} value={key}>
            {t.tabs[key]}
          </TabsTrigger>
        ))}
      </TabsList>
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
            <DirectoriesTab org={org} onChanged={reload} />
          </TabsContent>
          <TabsContent value="terminals">
            <TerminalsTab org={org} onChanged={reload} />
          </TabsContent>
          <TabsContent value="checklists">
            <ChecklistsTab org={org} />
          </TabsContent>
        </>
      ) : null}
    </Tabs>
  );
}
