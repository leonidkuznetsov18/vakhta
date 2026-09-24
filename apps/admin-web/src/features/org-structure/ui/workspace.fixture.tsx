import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmployeeStatusSchema, type EmployeeView } from '@vakhta/contracts';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { QueryFeedbackState } from '@/components/app/query-feedback';
import { notifySuccess } from '@/lib/toast';
import { Toaster } from '@/components/ui/sonner';
import {
  UnitsWorkspace,
  type WorkspaceActions,
  type WorkspaceDemo,
} from './workspace/units-workspace';
import {
  PEOPLE,
  UNIT,
  largeRoster,
  org as baseOrg,
  roster as baseRoster,
} from './workspace/fixture-data';
import type { WorkspaceInput } from '../model/workspace';
import type { MoveRequest } from './workspace/people-table';
import type { UnitDraft } from './workspace/unit-form-dialog';
import { fill, text } from './workspace/text';
import '@/index.css';

// Prototype entry for the units workspace; never part of the production build.
if (!import.meta.env.DEV) throw new Error('Units workspace fixture is development-only');
localStorage.setItem('vakhta.locale', 'ru');

type Org = WorkspaceInput['org'];
interface Data {
  readonly org: Org;
  readonly employees: readonly EmployeeView[];
}

interface Scenario {
  readonly data: Data;
  readonly demo: WorkspaceDemo;
  readonly editable: boolean;
  readonly query: 'ready' | 'loading' | 'error';
}

const ready: Data = { org: baseOrg, employees: baseRoster };
const noUnits: Data = {
  org: { ...baseOrg, orgUnits: [], teams: [], zones: [] },
  employees: baseRoster.map((employee) => ({ ...employee, currentPosition: null })),
};
const firstOperator = baseRoster.find((employee) => employee.personnelNumber === '1010');
const unassignedIds = baseRoster
  .filter(
    (employee) =>
      employee.currentPosition === null && employee.status === EmployeeStatusSchema.enum.ACTIVE,
  )
  .map((employee) => employee.id);

const scenario = (demo: WorkspaceDemo, extra: Partial<Scenario> = {}): Scenario => ({
  data: ready,
  demo,
  editable: true,
  query: 'ready',
  ...extra,
});

/** Every state the proposal shows, addressed as `?state=<key>`. */
const SCENARIOS: Record<string, Scenario> = {
  overview: scenario({ selectedKey: UNIT.lids }),
  attention: scenario({ selectedKey: UNIT.film, scope: 'attention' }),
  unassigned: scenario({ selectedKey: 'unassigned' }),
  assign: scenario({
    selectedKey: 'unassigned',
    openMoveFor: { personId: PEOPLE.melnyk, targetId: UNIT.film },
  }),
  move: scenario({
    selectedKey: UNIT.lids,
    openMoveFor: { personId: firstOperator?.id ?? '', targetId: UNIT.film },
  }),
  bulk: scenario({
    selectedKey: 'unassigned',
    initialSelection: unassignedIds.slice(0, 4),
    openBulkTargetId: UNIT.warehouse,
  }),
  master: scenario({ selectedKey: UNIT.film, masterPicker: true }),
  'master-inactive': scenario({ selectedKey: UNIT.warehouse }),
  'master-elsewhere': scenario({ selectedKey: UNIT.lab }),
  create: scenario({ selectedKey: UNIT.lids, createOpen: true }),
  search: scenario({ selectedKey: UNIT.lids, query: 'Мельник' }),
  'search-hit': scenario({
    selectedKey: UNIT.film,
    query: 'Коваленко',
    highlightId: PEOPLE.kovalenko,
  }),
  'no-results': scenario({ selectedKey: UNIT.lids, query: 'Бухгалтерия' }),
  'no-units': scenario({ selectedKey: 'unassigned' }, { data: noUnits }),
  readonly: scenario({ selectedKey: UNIT.film }, { editable: false }),
  large: scenario({ selectedKey: UNIT.lids }, { data: { org: baseOrg, employees: largeRoster() } }),
  loading: scenario({}, { query: 'loading' }),
  error: scenario({}, { query: 'error' }),
  list: scenario({}),
};

const QUERY_STATES: Record<Scenario['query'], QueryFeedbackState> = {
  ready: {
    isPending: false,
    isFetching: false,
    isError: false,
    fetchStatus: 'idle',
    error: null,
    refetch: async () => undefined,
  },
  loading: {
    isPending: true,
    isFetching: true,
    isError: false,
    fetchStatus: 'fetching',
    error: null,
    refetch: async () => undefined,
  },
  error: {
    isPending: false,
    isFetching: false,
    isError: true,
    fetchStatus: 'idle',
    error: new Error(text.states.error),
    refetch: async () => undefined,
  },
};

function movePeople(data: Data, request: MoveRequest): Data {
  const moving = new Set(request.people.map((person) => person.id));
  return {
    ...data,
    employees: data.employees.map((employee) =>
      moving.has(employee.id)
        ? {
            ...employee,
            currentPosition: {
              orgUnitId: request.target.unitId,
              positionId: request.target.positionId,
              teamId: request.target.teamId,
            },
          }
        : employee,
    ),
  };
}

function setMaster(data: Data, unitId: string, employeeId: string | null): Data {
  const employee = data.employees.find((row) => row.id === employeeId);
  const designatedMaster = employee
    ? { id: employee.id, name: employee.fullName, status: employee.status }
    : null;
  return {
    ...data,
    org: {
      ...data.org,
      orgUnits: data.org.orgUnits.map((unit) =>
        unit.id === unitId
          ? { ...unit, masterEmployeeId: employee?.id ?? null, designatedMaster }
          : unit,
      ),
    },
  };
}

function createUnit(data: Data, draft: UnitDraft): Data {
  const unit = {
    id: crypto.randomUUID(),
    siteId: draft.siteId,
    parentId: draft.parentId || null,
    name: draft.name,
    masters: [],
    masterEmployeeId: null,
    designatedMaster: null,
  };
  const next = { ...data, org: { ...data.org, orgUnits: [...data.org.orgUnits, unit] } };
  return draft.masterEmployeeId ? setMaster(next, unit.id, draft.masterEmployeeId) : next;
}

function Frame({ current }: { readonly current: Scenario }) {
  const [data, setData] = useState(current.data);
  const actions: WorkspaceActions = {
    onMove: (request) => {
      setData((prev) => movePeople(prev, request));
      notifySuccess(fill(text.move.done, { n: request.people.length }));
    },
    onAssignMaster: (unitId, employeeId) => setData((prev) => setMaster(prev, unitId, employeeId)),
    onClearMaster: (unitId) => setData((prev) => setMaster(prev, unitId, null)),
    onCreate: (draft) => {
      setData((prev) => createUnit(prev, draft));
      notifySuccess(text.unit.created);
    },
    onEdit: () => undefined,
    onAddChild: () => undefined,
    onDelete: () => undefined,
    onOpenShifts: () => undefined,
  };
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Администрирование</h1>
        <Tabs value="units">
          <TabsList>
            <TabsTrigger value="employees">Сотрудники</TabsTrigger>
            <TabsTrigger value="users">Пользователи и роли</TabsTrigger>
            <TabsTrigger value="units">{text.title}</TabsTrigger>
            <TabsTrigger value="directories">Справочники</TabsTrigger>
            <TabsTrigger value="terminals">Терминалы</TabsTrigger>
            <TabsTrigger value="checklists">Чек-листы</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <UnitsWorkspace
        org={data.org}
        employees={data.employees}
        editable={current.editable}
        queryState={QUERY_STATES[current.query]}
        actions={actions}
        demo={current.demo}
      />
    </main>
  );
}

const client = new QueryClient();
const state = new URLSearchParams(location.search).get('state') ?? 'overview';
const current = SCENARIOS[state] ?? SCENARIOS['overview'];
const root = document.getElementById('root');
if (!root || !current) throw new Error('Missing fixture root');
createRoot(root).render(
  <QueryClientProvider client={client}>
    <TooltipProvider delayDuration={200}>
      <Frame current={current} />
      <Toaster />
    </TooltipProvider>
  </QueryClientProvider>,
);
