import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { applyStoredAppearance } from '@/lib/theme';
import { installZodLocale } from '@/lib/validation';
import './index.css';

/**
 * Visual preview of the signed-in shell without an API: `fetch` answers with fixtures, so the
 * sidebar, the header and the pages can be screenshotted in a browser during development
 * (`pnpm --filter admin-web dev` → http://localhost:5173/preview.html). Not part of the build.
 */
const me: { [k: string]: unknown; image: string | null; roles: Record<string, unknown>[] } = {
  id: 'u-preview',
  email: 'admin@example.com',
  name: 'Леонид Кузнецов',
  twoFactorEnabled: true,
  image: null,
  roles: [
    {
      id: 'g1',
      role: 'ADMIN',
      scopeType: 'ENTERPRISE',
      scopeId: null,
      grantedAt: '2026-09-01T00:00:00Z',
    },
  ],
  createdAt: '2026-09-01T00:00:00Z',
};
const attention = {
  onShift: 3,
  unscheduled: 2,
  inDowntime: 1,
  openIncidents: 2,
  slaBreached: 0,
  disputes: 1,
  overdueAcceptances: 0,
  requestsForMe: 4,
  overdueRequests: 0,
  overtimePending: 2,
  unlinkedEmployees: 12,
  unpairedTerminals: 0,
  refreshedAt: new Date().toISOString(),
};
const org = {
  sites: [{ id: 's1', code: 'main', name: 'Основная площадка', timezone: 'Europe/Kyiv' }],
  orgUnits: [{ id: 'u1', siteId: 's1', parentId: null, name: 'Цех Крышки' }],
  teams: [],
  positions: [{ id: 'p1', code: 'OPERATOR', name: 'Оператор' }],
  zones: [],
  terminals: [],
  reasonCodes: [],
  shiftTemplates: [],
};
// One open shift for "Live shift": the row and its expanded details.
const shift = {
  id: 'sh1',
  employeeId: 'e1',
  assignmentId: null,
  businessDate: '2026-09-07',
  state: 'WORKING',
  resumeState: null,
  version: 3,
  startedAt: '2026-09-07T05:00:00.000Z',
  endedAt: null,
  stateSince: '2026-09-07T06:00:00.000Z',
  planStartAt: '2026-09-07T05:00:00.000Z',
  planEndAt: '2026-09-07T17:00:00.000Z',
  zoneId: null,
  zoneName: 'Линия 1',
  zoneAccepted: true,
  needsClarification: false,
  clarificationReason: null,
  autoCloseReason: null,
  fullName: 'Кузнецов Леонид',
  personnelNumber: '0001',
  orgUnitName: 'Цех Крышки',
  presenceSince: '2026-09-07T04:50:00.000Z',
  stateMinutes: 12,
};
const shiftDetail = {
  session: shift,
  intervals: [
    {
      id: 'i1',
      state: 'PREPARATION',
      startedAt: '2026-09-07T05:00:00.000Z',
      endedAt: '2026-09-07T05:20:00.000Z',
      resumeState: null,
      reasonCode: null,
    },
    {
      id: 'i2',
      state: 'WORKING',
      startedAt: '2026-09-07T05:20:00.000Z',
      endedAt: null,
      resumeState: null,
      reasonCode: null,
    },
  ],
  summary: null,
  events: [
    {
      id: 'ev1',
      type: 'SHIFT_STARTED',
      occurredAt: '2026-09-07T05:00:00.000Z',
      actorType: 'EMPLOYEE',
      reasonCode: null,
      comment: null,
      payload: {},
    },
    {
      id: 'ev2',
      type: 'WORK_STARTED',
      occurredAt: '2026-09-07T05:20:00.000Z',
      actorType: 'EMPLOYEE',
      reasonCode: null,
      comment: null,
      payload: {},
    },
  ],
  serverTime: '2026-09-07T06:12:00.000Z',
};
// The hours report: minute columns, so the chart legend can be checked.
const hoursReport = {
  kind: 'hours',
  title: 'Planned vs. actual hours and deviations',
  from: '2026-09-01',
  to: '2026-09-07',
  columns: [
    { key: 'employee', label: 'Employee', kind: 'text' },
    { key: 'shifts', label: 'Shifts', kind: 'number' },
    { key: 'plannedMinutes', label: 'Planned, min', kind: 'minutes' },
    { key: 'actualMinutes', label: 'Actual, min', kind: 'minutes' },
  ],
  rows: [
    { employee: 'Кузнецов Леонид', shifts: 1, plannedMinutes: 720, actualMinutes: 125 },
    { employee: 'Ткач Олена', shifts: 1, plannedMinutes: 720, actualMinutes: 123 },
  ],
  totals: { employee: 'Total', shifts: 2, plannedMinutes: 1440, actualMinutes: 248 },
  generatedAt: '2026-09-07T10:00:00.000Z',
  dataVersion: 'preview',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
window.fetch = async (input: RequestInfo | URL) => {
  const path = new URL(String(input), location.origin).pathname;
  if (path === '/me') return json(me);
  if (path.includes('attention')) return json(attention);
  if (path === '/admin/org') return json(org);
  if (path === '/admin/users') {
    return json([
      me,
      {
        ...me,
        id: 'u-master',
        email: 'master@example.com',
        name: 'Ткач Олена',
        twoFactorEnabled: false,
        roles: [
          { ...me.roles[0], id: 'g2', role: 'SHIFT_MASTER', scopeType: 'ORG_UNIT', scopeId: 'u1' },
        ],
      },
    ]);
  }
  if (path === '/admin/employees') {
    return json(
      [
        ['132', 'Гринько Юлія', true],
        ['131', 'Панов Олег', false],
        ['130', 'Ткач Олена', true],
        ['129', 'Калашнік Світлана', false],
      ].map(([personnelNumber, fullName, telegramLinked], i) => ({
        id: `emp-${i}`,
        personnelNumber,
        fullName,
        status: 'ACTIVE',
        telegramLinked,
        email: null,
        phone: null,
        telegramUsername: null,
        currentPosition: null,
        createdAt: '2026-09-01T00:00:00Z',
      })),
    );
  }
  const closedNoChecklist = {
    ...shift,
    id: 'sh-closed',
    employeeId: 'e2',
    fullName: 'Панов Олег',
    personnelNumber: '131',
    state: 'SHIFT_CLOSED',
    endedAt: '2026-09-07T18:10:00.000Z',
    autoCloseReason: 'NO_CHECKLIST',
  };
  if (path === '/admin/shifts') return json([shift, closedNoChecklist]);
  if (path === `/admin/shifts/${shift.id}`) return json(shiftDetail);
  if (path === '/admin/bonus/points') {
    return json({
      siteId: 's1',
      month: '2026-09',
      serverTime: new Date().toISOString(),
      employees: [
        {
          employeeId: 'e1',
          employeeName: 'Гринько Юлія',
          personnelNumber: '132',
          shifts: 5,
          checklists: 5,
          approved: 5,
          remarks: 0,
          points: 5,
        },
        {
          employeeId: 'e2',
          employeeName: 'Ткач Олена',
          personnelNumber: '130',
          shifts: 4,
          checklists: 4,
          approved: 3,
          remarks: 1,
          points: 3,
        },
        {
          employeeId: 'e3',
          employeeName: 'Панов Олег',
          personnelNumber: '131',
          shifts: 3,
          checklists: 2,
          approved: 2,
          remarks: 0,
          points: 2,
        },
      ],
    });
  }
  if (path === '/admin/reports/hours') return json(hoursReport);
  return json([]);
};
const params = new URLSearchParams(location.search);
// `?avatar=1` gives the fixture user a photo (a 1×1 PNG stretched by the browser is enough for layout).
if (params.get('avatar') === '1') {
  me.image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}
try {
  localStorage.setItem('vakhta.locale', params.get('lang') ?? 'uk');
  localStorage.setItem('vakhta.ui.theme', JSON.stringify(params.get('theme') ?? 'light'));
} catch {
  // preview only
}
installZodLocale();
applyStoredAppearance();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={200}>
      <App />
      <Toaster richColors position="bottom-right" closeButton />
    </TooltipProvider>
  </StrictMode>,
);
// `?collapsed=1` shows the icon rail: press the sidebar trigger once the shell has mounted.
if (params.get('collapsed') === '1') {
  const collapse = () => {
    const trigger = document.querySelector<HTMLButtonElement>('[data-sidebar="trigger"]');
    if (trigger) trigger.click();
    else setTimeout(collapse, 100);
  };
  setTimeout(collapse, 300);
}
