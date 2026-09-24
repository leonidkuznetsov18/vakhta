import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmployeeStatusSchema, type EmployeeView } from '@vakhta/contracts';
import {
  CalendarDaysIcon,
  ChartColumnIcon,
  LayoutGridIcon,
  MessageSquareIcon,
  NetworkIcon,
  SettingsIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { QueryFeedbackState } from '@/components/app/query-feedback';
import { LogoMark } from '@/components/app/logo';
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
import { ResponsibleSlot, type ResponsibleSlot as Slot } from '../model/org-node';
import type { WorkspaceOrg } from '../model/workspace';
import type { MoveRequest } from './workspace/people-table';
import type { UnitDraft } from './workspace/unit-form-dialog';
import { fill, text } from './workspace/text';
import '@/index.css';

// Prototype entry for the structure section; never part of the production build.
if (!import.meta.env.DEV) throw new Error('Org structure fixture is development-only');
localStorage.setItem('vakhta.locale', 'ru');

const TODAY = '2026-09-24';

interface Data {
  readonly org: WorkspaceOrg;
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
  org: {
    ...baseOrg,
    orgUnits: [],
    teams: [],
    zones: [],
    responsibles: [],
    history: [],
    payGroups: [],
  },
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

/** Every state the spec shows, addressed as `?state=<key>`. */
const SCENARIOS: Record<string, Scenario> = {
  overview: scenario({ selectedKey: UNIT.lids }),
  list: scenario({}),
  collapsed: scenario({ selectedKey: UNIT.production, collapsed: [UNIT.lids, UNIT.service] }),
  section: scenario({ selectedKey: UNIT.lidsLine1 }),
  attention: scenario({ selectedKey: UNIT.film, scope: 'attention' }),
  unassigned: scenario({ selectedKey: 'unassigned' }),
  assign: scenario({
    selectedKey: 'unassigned',
    openMoveFor: { personId: PEOPLE.melnyk, targetId: UNIT.film },
  }),
  move: scenario({
    selectedKey: UNIT.lidsLine1,
    openMoveFor: { personId: firstOperator?.id ?? '', targetId: UNIT.lidsLine2 },
  }),
  bulk: scenario({
    selectedKey: 'unassigned',
    initialSelection: unassignedIds.slice(0, 4),
    openBulkTargetId: UNIT.warehouse,
  }),
  head: scenario({ selectedKey: UNIT.film, slotPicker: ResponsibleSlot.HEAD }),
  'head-inactive': scenario({ selectedKey: UNIT.warehouse }),
  'head-elsewhere': scenario({ selectedKey: UNIT.lab }),
  menu: scenario({ selectedKey: UNIT.lids, menuOpen: true }),
  history: scenario({ selectedKey: UNIT.film, historyOpen: true }),
  create: scenario({ selectedKey: UNIT.production, createOpen: true }),
  search: scenario({ selectedKey: UNIT.lids, query: 'Мельник' }),
  'search-hit': scenario({
    selectedKey: UNIT.film,
    query: 'Коваленко',
    highlightId: PEOPLE.kovalenko,
  }),
  'no-results': scenario({ selectedKey: UNIT.lids, query: 'Бухгалтерия' }),
  'no-units': scenario({ selectedKey: 'unassigned' }, { data: noUnits }),
  readonly: scenario({ selectedKey: UNIT.film }, { editable: false }),
  large: scenario(
    { selectedKey: UNIT.lidsLine1 },
    { data: { org: baseOrg, employees: largeRoster() } },
  ),
  loading: scenario({}, { query: 'loading' }),
  error: scenario({}, { query: 'error' }),
};

const idle = { isFetching: false, isError: false, error: null, refetch: async () => undefined };
const QUERY_STATES: Record<Scenario['query'], QueryFeedbackState> = {
  ready: { ...idle, isPending: false, fetchStatus: 'idle' },
  loading: { ...idle, isPending: true, isFetching: true, fetchStatus: 'fetching' },
  error: {
    ...idle,
    isPending: false,
    isError: true,
    fetchStatus: 'idle',
    error: new Error(text.states.error),
  },
};

function movePeople(data: Data, request: MoveRequest): Data {
  const moving = new Set(request.people.map((person) => person.id));
  const currentPosition = {
    orgUnitId: request.target.unitId,
    positionId: request.target.positionId,
    teamId: request.target.teamId,
  };
  return {
    ...data,
    employees: data.employees.map((employee) =>
      moving.has(employee.id) ? { ...employee, currentPosition } : employee,
    ),
  };
}

function setResponsible(
  data: Data,
  target: { readonly unitId: string; readonly slot: Slot },
  employeeId: string | null,
): Data {
  const rest = data.org.responsibles.filter(
    (row) => !(row.unitId === target.unitId && row.slot === target.slot),
  );
  const added = employeeId ? [{ ...target, employeeId, validFrom: TODAY }] : [];
  return { ...data, org: { ...data.org, responsibles: [...rest, ...added] } };
}

function createUnit(data: Data, draft: UnitDraft): Data {
  const unit = {
    id: crypto.randomUUID(),
    siteId: draft.siteId,
    parentId: draft.parentId || null,
    name: draft.name,
    kind: draft.kind,
    masters: [],
    masterEmployeeId: null,
    designatedMaster: null,
    validFrom: draft.validFrom,
    archivedAt: null,
  };
  const next = { ...data, org: { ...data.org, orgUnits: [...data.org.orgUnits, unit] } };
  if (!draft.headEmployeeId) return next;
  return setResponsible(
    next,
    { unitId: unit.id, slot: ResponsibleSlot.HEAD },
    draft.headEmployeeId,
  );
}

const NAV = [
  { icon: MessageSquareIcon, label: 'Написать' },
  { icon: LayoutGridIcon, label: 'Обзор' },
  { icon: UsersRoundIcon, label: 'Сотрудники' },
  { icon: NetworkIcon, label: text.title, active: true },
  { icon: CalendarDaysIcon, label: 'График' },
  { icon: ChartColumnIcon, label: 'Отчёты' },
  { icon: SettingsIcon, label: 'Администрирование' },
] as const;

/** A static stand-in for the panel sidebar, so the section is seen where it will live. */
function SidebarMimic() {
  return (
    <nav
      aria-label="Разделы (макет)"
      className="hidden w-52 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-3 md:flex"
    >
      <div className="mb-3 flex items-center gap-2 px-2 font-semibold">
        <LogoMark className="size-6" />
        Vakhta
      </div>
      {NAV.map((item) => (
        <span
          key={item.label}
          aria-current={'active' in item ? 'page' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground',
            'active' in item && 'bg-sidebar-accent font-medium',
          )}
        >
          <item.icon aria-hidden="true" className="size-4 text-muted-foreground" />
          {item.label}
        </span>
      ))}
    </nav>
  );
}

function Frame({ current }: { readonly current: Scenario }) {
  const [data, setData] = useState(current.data);
  const actions: WorkspaceActions = {
    onMove: (request) => {
      setData((prev) => movePeople(prev, request));
      notifySuccess(fill(text.move.done, { n: request.people.length }));
    },
    onAssignResponsible: (unitId, slot, employeeId) =>
      setData((prev) => setResponsible(prev, { unitId, slot }, employeeId)),
    onClearResponsible: (unitId, slot) =>
      setData((prev) => setResponsible(prev, { unitId, slot }, null)),
    onCreate: (draft) => {
      setData((prev) => createUnit(prev, draft));
      notifySuccess(text.unit.created);
    },
    onEdit: () => undefined,
    onMoveNode: () => undefined,
    onArchive: () => undefined,
    onOpenShifts: () => undefined,
  };
  return (
    <div className="flex min-h-screen">
      <SidebarMimic />
      <main className="flex min-w-0 flex-1 flex-col gap-3 p-3 md:p-5">
        <h1 className="text-xl font-semibold">{text.title}</h1>
        <UnitsWorkspace
          org={data.org}
          employees={data.employees}
          today={TODAY}
          editable={current.editable}
          queryState={QUERY_STATES[current.query]}
          actions={actions}
          demo={current.demo}
        />
      </main>
    </div>
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
