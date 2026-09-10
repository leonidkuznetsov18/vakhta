import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { queryClient } from '@/lib/query';
import { setUiState } from '@/lib/ui-store';
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
  orgUnits: [
    {
      id: 'u1',
      siteId: 's1',
      parentId: null,
      name: 'Цех Крышки',
      masters: [{ id: 'u-master', name: 'Ткач Олена' }],
    },
    { id: 'u2', siteId: 's1', parentId: null, name: 'Цех Плёнка', masters: [] },
    { id: 'u3', siteId: 's1', parentId: null, name: 'Склад', masters: [] },
  ],
  teams: [],
  positions: [{ id: 'p1', code: 'OPERATOR', name: 'Оператор' }],
  zones: [
    {
      id: 'z1',
      siteId: 's1',
      orgUnitId: 'u1',
      code: 'L1',
      name: 'Линия 1',
      type: 'AREA',
      isShared: false,
      isActive: true,
    },
    {
      id: 'z2',
      siteId: 's1',
      orgUnitId: 'u2',
      code: 'L2',
      name: 'Линия 2',
      type: 'AREA',
      isShared: false,
      isActive: true,
    },
  ],
  terminals: [],
  reasonCodes: [],
  shiftTemplates: [],
};

/**
 * The schedule month, kept in memory: the overview hands the page a unit, a month and the people
 * who worked without a schedule, and the page answers by opening a draft with them in it. A static
 * fixture could not show that — the draft has to appear where there was none.
 */
const scheduleTemplates = [
  {
    id: 'tpl-day',
    siteId: 's1',
    code: 'DAY',
    name: 'Дневная',
    localStart: '08:00',
    localEnd: '20:00',
    isNight: false,
    isActive: true,
  },
  {
    id: 'tpl-night',
    siteId: 's1',
    code: 'NIGHT',
    name: 'Ночная',
    localStart: '20:00',
    localEnd: '08:00',
    isNight: true,
    isActive: true,
  },
];
const scheduleVersions: Record<string, unknown>[] = [];
function scheduleVersion(orgUnitId: string, periodMonth: string) {
  return {
    id: `sv-${scheduleVersions.length + 1}`,
    siteId: 's1',
    orgUnitId,
    periodMonth,
    versionNo: scheduleVersions.length + 1,
    status: 'DRAFT',
    createdBy: null,
    submittedAt: null,
    approvedBy: null,
    publishedAt: null,
    supersedesId: null,
    changeReason: null,
    createdAt: new Date().toISOString(),
    assignmentsCount: 0,
    deletable: true,
  };
}
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
  orgUnitId: 'u1',
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
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(String(input), location.origin).pathname;
  const method = init?.method ?? 'GET';
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
        ['e1', '0001', 'Кузнецов Леонид', true],
        ['e2', '130', 'Ткач Олена', true],
        ['e3', '131', 'Панов Олег', false],
        ['e4', '132', 'Гринько Юлія', true],
        ['e5', '129', 'Калашнік Світлана', false],
      ].map(([id, personnelNumber, fullName, telegramLinked]) => ({
        id,
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
  const handoverRecord = {
    id: 'hv1',
    shiftSessionId: 'sh1',
    zoneId: 'z1',
    zoneName: 'Перша стінка стаканів',
    submittedBy: 'e1',
    submittedByName: 'Ткач Олена',
    checklistDefinitionId: 'def',
    checklistVersion: 1,
    status: 'SUBMITTED',
    version: 2,
    items: [
      {
        key: 'FLOOR',
        label: 'Робочі поверхні чисті',
        kind: 'CHECK',
        answered: true,
        ok: true,
        remarkCategory: null,
        remarkText: null,
        safeToWork: null,
        needs: [],
        note: null,
      },
      {
        key: 'WASTE',
        label: 'Відходи паперу переміщені',
        kind: 'CHECK',
        answered: true,
        ok: true,
        remarkCategory: null,
        remarkText: null,
        safeToWork: null,
        needs: [],
        note: null,
      },
      {
        key: 'MESSAGE_NEXT',
        label: 'Повідомлення наступній зміні',
        kind: 'NOTE',
        answered: true,
        ok: true,
        remarkCategory: null,
        remarkText: null,
        safeToWork: null,
        needs: [],
        note: 'Привіт',
      },
    ],
    photos: [],
    issues: [],
    cannotCompleteReason: null,
    cannotCompleteComment: null,
    submittedAt: '2026-09-07T08:32:00.000Z',
    acceptDeadlineAt: '2026-09-07T14:25:00.000Z',
    escalatedToMasterAt: null,
    supersededById: null,
    createdAt: '2026-09-07T08:00:00.000Z',
  };
  if (path === '/admin/handovers') {
    const { items, issues, ...rest } = handoverRecord;
    void items;
    void issues;
    return json([{ ...rest, remarks: 0, overdue: false, reviewDecision: null }]);
  }
  if (path === '/admin/handovers/hv1') {
    return json({
      handover: handoverRecord,
      reviews: [],
      resolutions: [],
      serverTime: new Date().toISOString(),
    });
  }
  // Three people on an unscheduled shift across two units: enough to see how the overview groups
  // and names them, which one number never showed.
  const unscheduled = (
    id: string,
    employeeId: string,
    fullName: string,
    personnelNumber: string,
    orgUnitId: string | null,
    orgUnitName: string | null,
  ) => ({ ...shift, id, employeeId, fullName, personnelNumber, orgUnitId, orgUnitName });
  if (path === '/admin/shifts')
    return json([
      shift,
      unscheduled('sh2', 'e2', 'Ткач Олена', '130', 'u1', 'Цех Крышки'),
      unscheduled('sh3', 'e3', 'Панов Олег', '131', 'u2', 'Цех Плёнка'),
      // Nobody's unit: the case where the schedule page has nothing to open by itself.
      unscheduled('sh4', 'e4', 'Гринько Юлія', '132', null, null),
      closedNoChecklist,
    ]);
  if (path === `/admin/shifts/${shift.id}`) return json(shiftDetail);
  // Every shift the overview can deep-link into needs a detail, or opening its row lands on nothing.
  if (path.startsWith('/admin/shifts/') && !path.includes('/', '/admin/shifts/'.length)) {
    const id = path.slice('/admin/shifts/'.length);
    return json({ ...shiftDetail, session: { ...shiftDetail.session, id } });
  }
  if (path === '/admin/bonus/points') {
    const emp = (
      employeeId: string,
      employeeName: string,
      personnelNumber: string,
      orgUnitId: string,
      orgUnitName: string,
      shifts: number,
      checklists: number,
      approved: number,
      remarks: number,
    ) => ({
      employeeId,
      employeeName,
      personnelNumber,
      orgUnitId,
      orgUnitName,
      shifts,
      checklists,
      approved,
      remarks,
      points: approved,
    });
    return json({
      siteId: 's1',
      month: '2026-09',
      serverTime: new Date().toISOString(),
      employees: [
        emp('e1', 'Гринько Юлія', '132', 'u1', 'Цех Крышки', 5, 5, 5, 0),
        emp('e2', 'Ткач Олена', '130', 'u2', 'Цех Плёнка', 4, 4, 3, 1),
        emp('e3', 'Панов Олег', '131', 'u1', 'Цех Крышки', 3, 2, 2, 0),
      ],
      units: [
        {
          orgUnitId: 'u1',
          orgUnitName: 'Цех Крышки',
          masters: ['Ткач Олена'],
          employees: 2,
          approved: 7,
          remarks: 0,
          points: 7,
        },
        {
          orgUnitId: 'u2',
          orgUnitName: 'Цех Плёнка',
          masters: [],
          employees: 1,
          approved: 3,
          remarks: 1,
          points: 3,
        },
      ],
      employeeOfMonth: { id: 'e1', name: 'Гринько Юлія', points: 5 },
      unitOfMonth: { id: 'u1', name: 'Цех Крышки', points: 7 },
      masterOfMonth: { id: 'u1', name: 'Ткач Олена', points: 7 },
    });
  }
  if (path === '/admin/bonus/history') {
    const bucket = (key: string, points: number, awards: number, employees: number) => ({
      key,
      points,
      checklistPoints: points - awards,
      awardPoints: awards,
      employees,
      units: ['Цех Крышки', 'Цех Плёнка'],
    });
    const entry = (
      id: string,
      businessDate: string,
      employeeName: string,
      personnelNumber: string,
      orgUnitName: string,
      kind: string,
      points: number,
    ) => ({
      id,
      businessDate,
      month: businessDate.slice(0, 7),
      employeeId: `e-${id}`,
      employeeName,
      personnelNumber,
      orgUnitId: 'u1',
      orgUnitName,
      kind,
      points,
    });
    return json({
      groupBy: 'month',
      serverTime: new Date().toISOString(),
      total: 4,
      entries: [
        entry('1', '2026-09-04', 'Гринько Юлія', '132', 'Цех Крышки', 'CHECKLIST_APPROVED', 1),
        entry('2', '2026-09-03', 'Панов Олег', '131', 'Цех Крышки', 'CHECKLIST_APPROVED', 1),
        entry('3', '2026-08-31', 'Ткач Олена', '130', 'Цех Плёнка', 'MASTER_OF_MONTH', 1),
        entry('4', '2026-08-31', 'Гринько Юлія', '132', 'Цех Крышки', 'UNIT_OF_MONTH', 1),
      ],
      buckets: [
        bucket('2026-05', 18, 3, 6),
        bucket('2026-06', 24, 4, 7),
        bucket('2026-07', 21, 3, 7),
        bucket('2026-08', 29, 4, 8),
        bucket('2026-09', 10, 0, 3),
      ],
    });
  }
  if (path === '/admin/reports/losses') {
    const category = new URL(String(input), location.origin).searchParams.get('category');
    const bar = (key: string, label: string, minutes: number, cumulative: number, n: number) => ({
      key,
      label,
      minutes,
      share: minutes / 4276,
      cumulative,
      intervals: n,
      employees: 6,
    });
    return json({
      from: '2026-09-01',
      to: '2026-09-30',
      totalMinutes: 9108,
      lostMinutes: 4276,
      explainedShare: 0.04,
      category,
      categoryLabel: category ? 'Передача' : null,
      bars: category
        ? [bar('BREAKDOWN', 'Поломка', 90, 0.56, 3), bar('', 'Причину не вказано', 70, 1, 51)]
        : [
            bar('HANDOVER', 'Передача', 2170, 0.51, 54),
            bar('PREPARATION', 'Підготовка', 689, 0.67, 33),
            bar('READY_TO_CLOSE', 'Готова до закриття', 579, 0.8, 33),
            bar('BREAK', 'Перерва', 341, 0.88, 51),
            bar('MEAL', 'Обід', 309, 0.95, 26),
            bar('DOWNTIME', 'Простій', 160, 0.99, 5),
            bar('CLEANING', 'Прибирання', 24, 1, 55),
          ],
      intervals: category
        ? [
            {
              id: 'iv1',
              businessDate: '2026-09-08',
              employeeId: 'e1',
              employeeName: 'Гринько Юлія',
              orgUnitName: 'Цех Крышки',
              zoneName: 'Линия 1',
              category: 'HANDOVER',
              categoryLabel: 'Передача',
              reasonLabel: null,
              comment: null,
              startedAt: '2026-09-08T15:01:00.000Z',
              endedAt: '2026-09-08T15:41:00.000Z',
              minutes: 40,
            },
          ]
        : [],
      intervalsTotal: category ? 1 : 0,
      generatedAt: new Date().toISOString(),
    });
  }
  if (path === '/admin/reports/hours') return json(hoursReport);
  if (path.startsWith('/admin/employees/') && path.endsWith('/message'))
    return json({ employeeId: path.split('/')[3], fullName: 'Ткач Олена' });
  // A tiny grey PNG stands in for the photo: the point is that a thumbnail appears at all.
  if (path.startsWith('/admin/incidents/media/'))
    return json({
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
  // A quiet week is the normal state of this section, and the empty answer is what the panel gets
  // from the real server — not a 404 that reads as a broken page.
  const incident = {
    id: 'inc1',
    siteId: 's1',
    orgUnitId: 'u1',
    zoneId: 'z1',
    zoneName: 'Линия 1',
    reasonCode: 'SAFETY',
    reasonLabel: 'Безпека',
    severity: 'CRITICAL',
    status: 'IN_PROGRESS',
    duplicateOfId: null,
    assigneeId: null,
    openedAt: '2026-09-08T09:18:00.000Z',
    slaDueAt: '2026-09-08T09:48:00.000Z',
    acknowledgedAt: '2026-09-08T09:25:00.000Z',
    resolvedAt: null,
    closedAt: null,
    escalatedAt: null,
    slaBreached: true,
    reportedBy: 'Гринько Юлія',
    reportsCount: 1,
    stoppedNow: 1,
    lastComment: 'Огородили ділянку',
  };
  if (path === '/admin/incidents') return json([incident]);
  if (path === '/admin/incidents/inc1')
    return json({
      incident,
      reports: [
        {
          id: 'rep1',
          incidentId: 'inc1',
          shiftSessionId: 'sh1',
          employeeId: 'e4',
          fullName: 'Гринько Юлія',
          zoneId: 'z1',
          reasonCode: 'SAFETY',
          comment: 'роботу зупинено',
          stoppedWork: true,
          reportedAt: '2026-09-08T09:18:00.000Z',
          hasPhoto: true,
          media: {
            id: 'm1',
            quality: 'OK',
            width: 1280,
            height: 960,
            receivedAt: '2026-09-08T09:18:30.000Z',
            processedAt: '2026-09-08T09:19:00.000Z',
            duplicateOfId: null,
          },
        },
      ],
      history: [
        {
          id: 'h1',
          fromStatus: null,
          toStatus: 'REPORTED',
          actorType: 'EMPLOYEE',
          actorId: 'e4',
          at: '2026-09-08T09:18:00.000Z',
          comment: null,
        },
        {
          id: 'h2',
          fromStatus: 'REPORTED',
          toStatus: 'IN_PROGRESS',
          actorType: 'WEB_USER',
          actorId: 'u1',
          at: '2026-09-08T09:25:00.000Z',
          comment: 'Огородили ділянку',
        },
      ],
      duplicates: [],
      serverTime: new Date().toISOString(),
    });
  // One request awaiting a decision and one shift that ran over: enough to see both tables of the
  // section, and the row the overview's tiles deep-link into.
  const request = {
    id: 'rq1',
    type: 'VACATION',
    status: 'IN_REVIEW',
    employeeId: 'e2',
    employeeName: 'Ткач Олена',
    currentStep: 1,
    currentStepKey: 'MASTER',
    totalSteps: 2,
    periodFrom: '2026-09-20',
    periodTo: '2026-09-24',
    assignmentId: null,
    assignmentDate: null,
    counterpartEmployeeId: null,
    counterpartName: null,
    shiftSessionId: null,
    comment: 'Сімейні обставини',
    minutes: null,
    approvedMinutes: null,
    hasMedicalDocument: false,
    medicalMediaId: null,
    submittedAt: '2026-09-08T09:00:00.000Z',
    stepDeadlineAt: '2026-09-09T09:00:00.000Z',
    decidedAt: null,
    resultVersionId: null,
    overdue: false,
  };
  if (path === '/admin/requests') return json([request]);
  if (path === '/admin/requests/rq1')
    return json({
      request,
      decisions: [
        {
          id: 'd1',
          step: 1,
          stepKey: 'MASTER',
          actorType: 'WEB_USER',
          actorId: 'u1',
          actingRole: 'SHIFT_MASTER',
          decision: 'APPROVED',
          comment: 'Заміну знайшли',
          at: '2026-09-08T10:00:00.000Z',
        },
      ],
      serverTime: new Date().toISOString(),
    });
  if (path === '/admin/requests/overtime')
    return json([
      {
        id: null,
        shiftSessionId: 'sh1',
        employeeId: 'e1',
        employeeName: 'Кузнецов Леонид',
        businessDate: '2026-09-07',
        minutes: 95,
        status: 'PENDING',
        decidedBy: null,
        comment: null,
        decidedAt: null,
      },
    ]);
  if (path === '/admin/incidents/stats') {
    const zero = {
      key: 'total',
      label: 'Усього',
      incidents: 0,
      reports: 0,
      downtimeMinutes: 0,
      avgResolutionMinutes: null,
      slaBreached: 0,
    };
    return json({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-08T00:00:00.000Z',
      byReason: [],
      byZone: [],
      totals: zero,
    });
  }
  if (path.startsWith('/admin/schedules/templates')) return json(scheduleTemplates);
  if (path === '/admin/schedules' && method === 'POST') {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      orgUnitId: string;
      periodMonth: string;
    };
    const created = scheduleVersion(body.orgUnitId, body.periodMonth);
    scheduleVersions.push(created);
    return json(created, 201);
  }
  if (path === '/admin/schedules') {
    const q = new URL(String(input), location.origin).searchParams;
    return json(
      scheduleVersions.filter(
        (v) => v.orgUnitId === q.get('orgUnitId') && v.periodMonth === q.get('periodMonth'),
      ),
    );
  }
  if (path.startsWith('/admin/schedules/sv-')) {
    const id = path.split('/')[3];
    const version = scheduleVersions.find((v) => v.id === id);
    if (version) return json({ version, assignments: [] });
  }
  // Anything this harness has no fixture for is a gap in the harness, not an empty answer from a
  // server. Saying so out loud stops "the record was added" over a list that never changes from
  // looking like a bug in the panel.
  console.warn(`[preview] no fixture for ${method} ${path} — answering 404`);
  return json({ code: 'PREVIEW_NO_FIXTURE', message: `${method} ${path}` }, 404);
};
const params = new URLSearchParams(location.search);
// `?avatar=1` gives the fixture user a photo (a 1×1 PNG stretched by the browser is enough for layout).
if (params.get('avatar') === '1') {
  me.image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}
try {
  localStorage.setItem('vakhta.locale', params.get('lang') ?? 'uk');
} catch {
  // preview only
}
setUiState({ theme: params.get('theme') ?? 'light' });
installZodLocale();
applyStoredAppearance();
// Nothing here reaches a server: `fetch` is stubbed above and every answer is a fixture. Without
// saying so, a form that "saves" and a list that never changes read as a bug in the panel.
{
  const banner = document.createElement('div');
  banner.textContent =
    'PREVIEW — макет із вигаданими даними. Нічого не зберігається, запити не йдуть на сервер.';
  banner.style.cssText =
    'position:fixed;inset:auto 0 0 0;z-index:9999;background:#b91c1c;color:#fff;' +
    'font:600 12px/1.6 system-ui,sans-serif;text-align:center;padding:4px 8px';
  document.body.append(banner);
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <App />
        <Toaster richColors position="bottom-right" closeButton />
      </TooltipProvider>
    </QueryClientProvider>
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
