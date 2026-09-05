import React, { useCallback, useEffect, useState } from 'react';
import type { OrgSnapshot } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { orgApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { DirectoriesTab } from './DirectoriesTab.tsx';
import { EmployeesTab } from './EmployeesTab.tsx';
import { TerminalsTab } from './TerminalsTab.tsx';
import { UsersTab } from './UsersTab.tsx';

const t = messages('ru').admin.administration;
type Tab = keyof typeof t.tabs;
const TABS = Object.keys(t.tabs) as Tab[];

/** Розділ «Администрирование»: вкладки за ТЗ 9.1, спільний знімок довідників. */
export function AdminPage() {
  const [tab, setTab] = useState<Tab>('employees');
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setOrg(await orgApi.snapshot());
  }, []);

  useEffect(() => {
    reload().catch((e: unknown) => setError(describeError(e)));
  }, [reload]);

  return (
    <section>
      <div className="tabs" role="tablist">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === tab}
            className={key === tab ? 'active' : undefined}
            onClick={() => setTab(key)}
          >
            {t.tabs[key]}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {org && tab === 'employees' && <EmployeesTab org={org} />}
      {org && tab === 'users' && <UsersTab org={org} />}
      {org && tab === 'directories' && <DirectoriesTab org={org} onChanged={reload} />}
      {org && tab === 'terminals' && <TerminalsTab org={org} onChanged={reload} />}
    </section>
  );
}
