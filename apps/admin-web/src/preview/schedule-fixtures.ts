import { assignmentInstants, planInstants } from '@vakhta/domain';
import {
  ScheduleRevisionPrecondition,
  ScheduleWebCommand,
  ScheduleCommandResult,
  CreateScheduleVersionCommand,
  PutAssignmentsCommand,
  ReviseScheduleCommand,
  type ScheduleVersionView,
  type AssignmentInput,
  type ScheduleVersionDetail,
} from '@vakhta/contracts';
export const scheduleSiteId = 'a0000000-0000-4000-8000-000000000001';
export const scheduleUnitId = 'a0000000-0000-4000-8000-000000000002';
export const scheduleZoneId = 'a0000000-0000-4000-8000-000000000003';
export const scheduleEmployees = [
  'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000003',
];
const secondZone = 'a0000000-0000-4000-8000-000000000004';
export const scheduleTemplates = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    siteId: scheduleSiteId,
    code: 'DAY',
    name: 'Денна',
    localStart: '08:00',
    localEnd: '20:00',
    isNight: false,
    isActive: true,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    siteId: scheduleSiteId,
    code: 'NIGHT',
    name: 'Нічна',
    localStart: '20:00',
    localEnd: '08:00',
    isNight: true,
    isActive: true,
  },
];
const month = new Date().toISOString().slice(0, 7);
const versions: ScheduleVersionView[] = [];
const assignments = new Map<string, AssignmentInput[]>();
function create(unit: string, periodMonth: string): ScheduleVersionView {
  return {
    id: crypto.randomUUID(),
    siteId: scheduleSiteId,
    orgUnitId: unit,
    periodMonth,
    versionNo: versions.length + 1,
    revision: 1,
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
const simulateStaleSave = new URLSearchParams(location.search).get('schedule') === 'stale';
let staleSaveInjected = false;
const simulateLostResponse =
  new URLSearchParams(location.search).get('schedule') === 'lost-response';
let lostResponseInjected = false;
const commandReceipts = new Map<string, ScheduleCommandResult>();
const initial = create(scheduleUnitId, month);
// Stable identity makes local recovery scenarios reproducible across preview reloads.
initial.id = 'd0000000-0000-4000-8000-000000000001';
initial.status = simulateStaleSave || simulateLostResponse ? 'DRAFT' : 'PUBLISHED';
initial.deletable = simulateStaleSave || simulateLostResponse;
initial.publishedAt = new Date().toISOString();
versions.push(initial);
const initialItems: AssignmentInput[] = [];
for (let day = 1; day <= 28; day++)
  for (const [index, employeeId] of scheduleEmployees.entries()) {
    const template = scheduleTemplates[(day + index) % 2];
    if (!template || (day + index) % 4 === 0) continue;
    initialItems.push({
      employeeId,
      businessDate: `${month}-${String(day).padStart(2, '0')}`,
      templateId: template.id,
      zoneId: index === 2 ? secondZone : scheduleZoneId,
      kind: 'REGULAR',
    });
  }
// One shift with custom hours split between two zones (SC-32, SC-37).
const customShift = initialItems.find(
  (item) => item.businessDate === `${month}-02` && item.zoneId === scheduleZoneId,
);
if (customShift && scheduleTemplates[0]) {
  Object.assign(customShift, {
    customStart: '10:00',
    customEnd: '22:00',
    segments: [
      { zoneId: scheduleZoneId, localStart: '10:00', localEnd: '16:00' },
      { zoneId: secondZone, localStart: '16:00', localEnd: '22:00' },
    ],
  });
}
// A relieved and an unrelieved planned break on the 3rd (SC-36).
const withBreaks = initialItems.filter((item) => item.businessDate === `${month}-03`);
if (withBreaks[0] && withBreaks[1]) {
  Object.assign(withBreaks[0], {
    breaks: [
      { localStart: '00:00', localEnd: '00:30', reliefEmployeeId: withBreaks[1].employeeId },
    ],
  });
}
const unrelieved = initialItems.find(
  (item) => item.businessDate === `${month}-04` && item.zoneId === scheduleZoneId,
);
if (unrelieved) Object.assign(unrelieved, { breaks: [{ localStart: '03:00', localEnd: '03:30' }] });
initial.assignmentsCount = initialItems.length;
assignments.set(initial.id, initialItems);
// The next month is published too, so a week crossing the boundary shows both plans.
const nextMonth = new Date(`${month}-01T00:00:00Z`);
nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
const following = create(scheduleUnitId, nextMonth.toISOString().slice(0, 7));
following.id = 'd0000000-0000-4000-8000-000000000009';
following.status = 'PUBLISHED';
following.deletable = false;
following.publishedAt = new Date().toISOString();
const followingItems: AssignmentInput[] = [];
for (let day = 1; day <= 7; day++)
  for (const [index, employeeId] of scheduleEmployees.entries()) {
    const template = scheduleTemplates[(day + index + 1) % 2];
    if (!template || (day + index) % 3 === 0) continue;
    followingItems.push({
      employeeId,
      businessDate: `${following.periodMonth}-${String(day).padStart(2, '0')}`,
      templateId: template.id,
      zoneId: index === 2 ? secondZone : scheduleZoneId,
      kind: 'REGULAR',
    });
  }
following.assignmentsCount = followingItems.length;
assignments.set(following.id, followingItems);
versions.push(following);
export const extraScheduleZone = {
  id: secondZone,
  siteId: scheduleSiteId,
  orgUnitId: scheduleUnitId,
  code: 'PACK',
  name: 'Пакувальна дільниця — контроль готової продукції',
  type: 'AREA',
  isShared: false,
  isActive: true,
};
function detail(version: ScheduleVersionView): ScheduleVersionDetail {
  return {
    version,
    assignments: (assignments.get(version.id) ?? []).map((item) => {
      const template = scheduleTemplates.find((value) => value.id === item.templateId);
      if (!template) throw new Error('Preview template missing');
      const instants = assignmentInstants({ ...item, template }, 'Europe/Kyiv');
      return {
        ...item,
        id: crypto.randomUUID(),
        customStart: item.customStart ?? null,
        customEnd: item.customEnd ?? null,
        segments: (item.segments ?? []).map((segment, position) => ({
          id: crypto.randomUUID(),
          position,
          ...segment,
        })),
        breaks: (item.breaks ?? []).map((pause, position) => ({
          id: crypto.randomUUID(),
          position,
          localStart: pause.localStart,
          localEnd: pause.localEnd,
          reliefEmployeeId: pause.reliefEmployeeId ?? null,
        })),
        scheduleVersionId: version.id,
        templateCode: template?.code ?? 'DAY',
        planStartAt: instants.planStartAt.toISOString(),
        planEndAt: instants.planEndAt.toISOString(),
        orgUnitId: version.orgUnitId,
        positionId: item.positionId ?? null,
        teamId: item.teamId ?? null,
        zoneId: item.zoneId ?? null,
        status: 'PLANNED',
        acknowledgedAt: null,
      };
    }),
  };
}
const qualificationId = 'e1000000-0000-4000-8000-000000000001';
const staffing = {
  qualifications: [
    {
      id: qualificationId,
      siteId: scheduleSiteId,
      code: 'OPERATOR',
      name: 'Оператор лінії',
      isActive: true,
    },
  ],
  requirements: [
    {
      id: 'e2000000-0000-4000-8000-000000000001',
      zoneId: scheduleZoneId,
      templateId: scheduleTemplates[0]!.id,
      requiredCount: 2,
      qualificationId,
      effectiveFrom: `${month}-01`,
      effectiveTo: null,
      note: null,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'e2000000-0000-4000-8000-000000000002',
      zoneId: scheduleZoneId,
      templateId: scheduleTemplates[1]!.id,
      requiredCount: 1,
      qualificationId: null,
      effectiveFrom: `${month}-01`,
      effectiveTo: null,
      note: null,
      updatedAt: new Date().toISOString(),
    },
  ],
  holdings: [
    {
      id: 'e3000000-0000-4000-8000-000000000001',
      employeeId: scheduleEmployees[0]!,
      qualificationId,
      validFrom: '2026-01-01',
      validUntil: null,
      note: null,
      recordedAt: new Date().toISOString(),
    },
  ],
  rules: {
    siteId: scheduleSiteId,
    minRestMinutes: 660,
    maxMonthMinutes: 12000,
    restSeverity: 'WARN' as 'WARN' | 'BLOCK',
    hoursSeverity: 'WARN' as 'WARN' | 'BLOCK',
    configured: false,
  },
  availability: [
    {
      id: 'e4000000-0000-4000-8000-000000000001',
      employeeId: scheduleEmployees[1]!,
      kind: 'UNAVAILABLE' as 'UNAVAILABLE' | 'PREFERRED',
      weekday: 0,
      date: null,
      validFrom: '2026-01-01',
      validTo: null,
      note: null,
    },
  ],
};
// One approved vacation and one plan in another unit make conflicts visible in the preview.
const planContext = {
  intervals: [
    {
      employeeId: scheduleEmployees[2]!,
      businessDate: `${month}-09`,
      startAt: planInstants(
        `${month}-09`,
        scheduleTemplates[0]!,
        'Europe/Kyiv',
      ).planStartAt.toISOString(),
      endAt: planInstants(
        `${month}-09`,
        scheduleTemplates[0]!,
        'Europe/Kyiv',
      ).planEndAt.toISOString(),
      orgUnitId: 'a0000000-0000-4000-8000-000000000012',
      status: 'PUBLISHED' as const,
    },
  ],
  absences: [
    {
      employeeId: scheduleEmployees[1]!,
      from: `${month}-15`,
      to: `${month}-16`,
      type: 'VACATION',
      status: 'APPROVED' as const,
    },
    {
      employeeId: scheduleEmployees[2]!,
      from: `${month}-04`,
      to: `${month}-06`,
      type: 'VACATION',
      status: 'APPROVED' as const,
    },
    {
      employeeId: scheduleEmployees[0]!,
      from: `${month}-03`,
      to: `${month}-03`,
      type: 'DAY_OFF',
      status: 'PENDING' as const,
    },
  ],
  otherUnitEmployees: [] as { employeeId: string; orgUnitId: string }[],
};
const patterns: {
  id: string;
  siteId: string;
  name: string;
  definition: { pattern: string; templateId: string | null; mode: string; zoneId: string | null };
  createdAt: string;
}[] = [
  {
    id: 'e5000000-0000-4000-8000-000000000001',
    siteId: scheduleSiteId,
    name: '2/2 денна · Лінія 1',
    definition: { pattern: 'DAY_2_2', templateId: null, mode: 'replace', zoneId: scheduleZoneId },
    createdAt: new Date().toISOString(),
  },
];
interface PreviewSlot {
  id: string;
  siteId: string;
  orgUnitId: string;
  periodMonth: string;
  businessDate: string;
  templateId: string;
  zoneId: string;
  status: 'OPEN' | 'OFFERED' | 'FILLED' | 'CANCELLED';
  filledEmployeeId: string | null;
  filledVersionId: string | null;
  offer: {
    id: string;
    status: 'OPEN' | 'CLOSED' | 'CANCELLED';
    audience: 'UNIT' | 'ALL';
    notifiedCount: number;
    offeredAt: string;
    closedAt: string | null;
    interests: { employeeId: string; response: 'INTERESTED' | 'DECLINED'; respondedAt: string }[];
  } | null;
  offerCount: number;
  createdAt: string;
}
// One offered slot with responses and one internal slot (SC-15/SC-16).
const openSlots: PreviewSlot[] = [
  {
    id: 'f1000000-0000-4000-8000-000000000001',
    siteId: scheduleSiteId,
    orgUnitId: scheduleUnitId,
    periodMonth: month,
    businessDate: `${month}-05`,
    templateId: scheduleTemplates[0]!.id,
    zoneId: scheduleZoneId,
    status: 'OFFERED',
    filledEmployeeId: null,
    filledVersionId: null,
    offer: {
      id: 'f2000000-0000-4000-8000-000000000001',
      status: 'OPEN',
      audience: 'UNIT',
      notifiedCount: 3,
      offeredAt: new Date(Date.now() - 3600_000).toISOString(),
      closedAt: null,
      interests: [
        {
          employeeId: scheduleEmployees[1]!,
          response: 'INTERESTED',
          respondedAt: new Date(Date.now() - 1800_000).toISOString(),
        },
        {
          employeeId: scheduleEmployees[2]!,
          response: 'DECLINED',
          respondedAt: new Date(Date.now() - 900_000).toISOString(),
        },
      ],
    },
    offerCount: 1,
    createdAt: new Date(Date.now() - 7200_000).toISOString(),
  },
  {
    id: 'f1000000-0000-4000-8000-000000000002',
    siteId: scheduleSiteId,
    orgUnitId: scheduleUnitId,
    periodMonth: month,
    businessDate: `${month}-06`,
    templateId: scheduleTemplates[1]!.id,
    zoneId: secondZone,
    status: 'OPEN',
    filledEmployeeId: null,
    filledVersionId: null,
    offer: null,
    offerCount: 0,
    createdAt: new Date(Date.now() - 7200_000).toISOString(),
  },
];

interface PreviewNote {
  id: string;
  siteId: string;
  orgUnitId: string;
  periodMonth: string;
  businessDate: string | null;
  zoneId: string | null;
  employeeId: string | null;
  audience: 'PLANNERS' | 'EMPLOYEES';
  text: string;
  createdBy: string | null;
  createdAt: string;
}
const notes: PreviewNote[] = [
  {
    id: 'b7000000-0000-4000-8000-000000000001',
    siteId: scheduleSiteId,
    orgUnitId: scheduleUnitId,
    periodMonth: month,
    businessDate: `${month}-05`,
    zoneId: null,
    employeeId: null,
    audience: 'PLANNERS',
    text: 'Аудит якості на лінії о 10:00 — тримати повний склад, не відпускати на перерви одночасно.',
    createdBy: null,
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: 'b7000000-0000-4000-8000-000000000002',
    siteId: scheduleSiteId,
    orgUnitId: scheduleUnitId,
    periodMonth: month,
    businessDate: `${month}-05`,
    zoneId: null,
    employeeId: scheduleEmployees[0]!,
    audience: 'EMPLOYEES',
    text: 'Візьміть новий бейдж на прохідній перед зміною.',
    createdBy: null,
    createdAt: new Date(Date.now() - 1800_000).toISOString(),
  },
];

/** In-memory preview only: exercises the actual validated frontend contract, never production. */
export function scheduleFixture(url: URL, method: string, body: unknown): unknown {
  if (url.pathname.startsWith('/admin/schedules/notes')) {
    if (method === 'GET')
      return notes.filter((note) => note.periodMonth === url.searchParams.get('periodMonth'));
    if (method === 'POST') {
      const input = body as Omit<PreviewNote, 'id' | 'createdBy' | 'createdAt'>;
      const row: PreviewNote = {
        ...input,
        id: crypto.randomUUID(),
        createdBy: null,
        createdAt: new Date().toISOString(),
      };
      notes.push(row);
      return row;
    }
    if (method === 'DELETE') {
      const id = url.pathname.split('/').at(-1);
      notes.splice(
        notes.findIndex((note) => note.id === id),
        1,
      );
      return {};
    }
  }
  if (url.pathname.startsWith('/admin/schedules/reports/retrospective')) {
    const rows = detail(initial).assignments;
    const today = new Date().toISOString().slice(0, 10);
    const report = rows.map((item, index) => {
      const past = item.businessDate < today;
      const departure = !past ? 'NONE' : index % 4 === 0 ? 'UNKNOWN' : 'RECORDED';
      return {
        assignmentId: item.id,
        employeeId: item.employeeId,
        businessDate: item.businessDate,
        zoneId: item.zoneId,
        plannedStartAt: item.planStartAt,
        plannedEndAt: item.planEndAt,
        plannedMinutes: 720,
        sessionId: past ? crypto.randomUUID() : null,
        recordedStartAt: past ? item.planStartAt : null,
        recordedEndAt: past && departure === 'RECORDED' ? item.planEndAt : null,
        workMinutes: past && departure === 'RECORDED' ? 600 + (index % 3) * 20 : null,
        totalMinutes: past && departure === 'RECORDED' ? 715 : null,
        departure,
        autoCloseReason: departure === 'UNKNOWN' ? 'NO_CHECKLIST' : null,
      };
    });
    const totals = new Map<string, Record<string, number | string>>();
    for (const row of report) {
      const total = totals.get(row.employeeId) ?? {
        employeeId: row.employeeId,
        shifts: 0,
        plannedMinutes: 0,
        workMinutes: 0,
        recordedShifts: 0,
        unknownDepartures: 0,
        missingActuals: 0,
      };
      totals.set(row.employeeId, {
        ...total,
        shifts: Number(total.shifts) + 1,
        plannedMinutes: Number(total.plannedMinutes) + row.plannedMinutes,
        workMinutes: Number(total.workMinutes) + (row.workMinutes ?? 0),
        recordedShifts: Number(total.recordedShifts) + (row.sessionId ? 1 : 0),
        unknownDepartures: Number(total.unknownDepartures) + (row.departure === 'UNKNOWN' ? 1 : 0),
        missingActuals: Number(total.missingActuals) + (row.departure === 'NONE' ? 1 : 0),
      });
    }
    return {
      generatedAt: new Date().toISOString(),
      timezone: 'Europe/Kyiv',
      periodMonth: month,
      siteId: scheduleSiteId,
      orgUnitId: scheduleUnitId,
      version: { id: initial.id, versionNo: initial.versionNo, publishedAt: initial.publishedAt },
      rows: report,
      totals: [...totals.values()],
    };
  }
  if (url.pathname.startsWith('/admin/schedules/open-slots')) {
    const [, , , , id, action] = url.pathname.split('/');
    if (method === 'GET')
      return openSlots.filter((slot) => slot.periodMonth === url.searchParams.get('periodMonth'));
    if (method === 'POST' && !id) {
      const input = body as Pick<
        PreviewSlot,
        'siteId' | 'orgUnitId' | 'periodMonth' | 'businessDate' | 'templateId' | 'zoneId'
      >;
      const row: PreviewSlot = {
        ...input,
        id: crypto.randomUUID(),
        status: 'OPEN',
        filledEmployeeId: null,
        filledVersionId: null,
        offer: null,
        offerCount: 0,
        createdAt: new Date().toISOString(),
      };
      openSlots.push(row);
      return row;
    }
    const slot = openSlots.find((item) => item.id === id);
    if (!slot) throw new Error('Preview slot missing');
    if (action === 'offer') {
      slot.status = 'OFFERED';
      slot.offer = {
        id: crypto.randomUUID(),
        status: 'OPEN',
        audience: (body as { audience: 'UNIT' | 'ALL' }).audience,
        notifiedCount: 3,
        offeredAt: new Date().toISOString(),
        closedAt: null,
        interests: [],
      };
      slot.offerCount += 1;
      return slot;
    }
    if (action === 'withdraw') {
      slot.status = 'OPEN';
      if (slot.offer)
        slot.offer = { ...slot.offer, status: 'CANCELLED', closedAt: new Date().toISOString() };
      return slot;
    }
    if (action === 'cancel') {
      slot.status = 'CANCELLED';
      if (slot.offer)
        slot.offer = { ...slot.offer, status: 'CANCELLED', closedAt: new Date().toISOString() };
      return slot;
    }
    if (action === 'select') {
      const input = body as { employeeId: string; versionId: string };
      slot.status = 'FILLED';
      slot.filledEmployeeId = input.employeeId;
      slot.filledVersionId = input.versionId;
      if (slot.offer)
        slot.offer = { ...slot.offer, status: 'CLOSED', closedAt: new Date().toISOString() };
      const version = versions.find((item) => item.id === input.versionId);
      if (!version) throw new Error('Preview version missing');
      const items = assignments.get(version.id) ?? [];
      items.push({
        employeeId: input.employeeId,
        businessDate: slot.businessDate,
        templateId: slot.templateId,
        zoneId: slot.zoneId,
        kind: 'REGULAR',
      });
      version.assignmentsCount = items.length;
      version.revision += 1;
      return { slot, detail: detail(version) };
    }
  }
  if (url.pathname.startsWith('/admin/schedules/patterns')) {
    if (method === 'GET') return patterns;
    if (method === 'POST') {
      const input = body as (typeof patterns)[number];
      const row = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      const index = patterns.findIndex((item) => item.name === input.name);
      if (index >= 0) patterns[index] = { ...patterns[index]!, definition: input.definition };
      else patterns.push(row);
      return index >= 0 ? patterns[index] : row;
    }
    if (method === 'DELETE') {
      const id = url.pathname.split('/').at(-1);
      patterns.splice(
        patterns.findIndex((item) => item.id === id),
        1,
      );
      return {};
    }
  }
  if (url.pathname.startsWith('/admin/schedules/staffing')) {
    if (url.pathname.endsWith('/operations') && method === 'GET') {
      const from = url.searchParams.get('from') ?? '';
      const to = url.searchParams.get('to') ?? '';
      const rows = detail(initial).assignments.filter(
        (item) => item.businessDate >= from && item.businessDate <= to,
      );
      const today = new Date().toISOString().slice(0, 10);
      return {
        fetchedAt: new Date().toISOString(),
        presence: rows.map((item, index) => {
          const past = item.businessDate < today;
          const state = past
            ? index % 3 === 0
              ? 'NO_EVIDENCE'
              : 'CLOSED'
            : item.businessDate === today
              ? index % 2 === 0
                ? 'STARTED'
                : 'ARRIVED'
              : index % 2 === 0
                ? 'ACKNOWLEDGED'
                : 'SCHEDULED';
          return {
            assignmentId: item.id,
            employeeId: item.employeeId,
            businessDate: item.businessDate,
            state,
            acknowledgedAt: state === 'SCHEDULED' ? null : item.planStartAt,
            arrivedAt: ['ARRIVED', 'STARTED', 'CLOSED'].includes(state) ? item.planStartAt : null,
            startedAt: ['STARTED', 'CLOSED'].includes(state) ? item.planStartAt : null,
            endedAt: state === 'CLOSED' ? item.planEndAt : null,
            sessionState:
              state === 'STARTED' ? 'WORKING' : state === 'CLOSED' ? 'SHIFT_CLOSED' : null,
            sessionId: ['STARTED', 'CLOSED'].includes(state) ? crypto.randomUUID() : null,
          };
        }),
        requests: [
          {
            id: 'a7000000-0000-4000-8000-000000000001',
            type: 'SWAP',
            status: 'IN_REVIEW',
            employeeId: scheduleEmployees[0]!,
            counterpartEmployeeId: scheduleEmployees[1]!,
            periodFrom: null,
            periodTo: null,
            assignmentId: rows[0]?.id ?? null,
            assignmentDate: `${month}-05`,
            currentStep: 1,
            currentStepKey: 'MASTER',
            totalSteps: 2,
            submittedAt: new Date(Date.now() - 86_400_000).toISOString(),
          },
          {
            id: 'a7000000-0000-4000-8000-000000000002',
            type: 'VACATION',
            status: 'APPROVED',
            employeeId: scheduleEmployees[2]!,
            counterpartEmployeeId: null,
            periodFrom: `${month}-04`,
            periodTo: `${month}-06`,
            assignmentId: null,
            assignmentDate: null,
            currentStep: 2,
            currentStepKey: null,
            totalSteps: 2,
            submittedAt: new Date(Date.now() - 172_800_000).toISOString(),
          },
        ],
      };
    }
    if (url.pathname.endsWith('/context') && method === 'GET') return planContext;
    if (url.pathname.endsWith('/candidates') && method === 'GET') {
      const businessDate = url.searchParams.get('businessDate') ?? '';
      return scheduleEmployees.map((employeeId, index) => {
        const absence = planContext.absences.find(
          (item) =>
            item.employeeId === employeeId && item.from <= businessDate && businessDate <= item.to,
        );
        const busy = (assignments.get(initial.id) ?? []).some(
          (item) => item.employeeId === employeeId && item.businessDate === businessDate,
        );
        const reasons = absence
          ? [
              {
                code: 'ABSENCE',
                severity: 'BLOCK',
                employeeId,
                businessDate,
                detail: { type: absence.type, from: absence.from, to: absence.to },
              },
            ]
          : busy
            ? [
                {
                  code: 'OVERLAP',
                  severity: 'BLOCK',
                  employeeId,
                  businessDate,
                  detail: { withDate: businessDate },
                },
              ]
            : index === 1
              ? [
                  {
                    code: 'REST',
                    severity: 'WARN',
                    employeeId,
                    businessDate,
                    detail: { restMinutes: 480, minRestMinutes: 660, withDate: businessDate },
                  },
                ]
              : [];
        return {
          employeeId,
          orgUnitId: scheduleUnitId,
          ownUnit: true,
          status: reasons.some((r) => r.severity === 'BLOCK')
            ? 'BLOCKED'
            : reasons.length
              ? 'WARNING'
              : 'ELIGIBLE',
          reasons,
        };
      });
    }
    if (url.pathname.endsWith('/rules') && method === 'PUT') {
      const input = body as typeof staffing.rules;
      staffing.rules = { ...staffing.rules, ...input, configured: true };
      return staffing.rules;
    }
    if (url.pathname.endsWith('/availability') && method === 'POST') {
      const input = body as (typeof staffing.availability)[number];
      const row = {
        ...input,
        id: crypto.randomUUID(),
        weekday: input.weekday ?? null,
        date: input.date ?? null,
        validTo: input.validTo ?? null,
        note: input.note ?? null,
      };
      staffing.availability.push(row);
      return row;
    }
    if (url.pathname.includes('/availability/') && method === 'DELETE') {
      const id = url.pathname.split('/').at(-1);
      staffing.availability = staffing.availability.filter((item) => item.id !== id);
      return {};
    }
    if (method === 'GET') return staffing;
    if (url.pathname.endsWith('/requirements') && method === 'PUT') {
      const input = body as (typeof staffing.requirements)[number] & { id?: string };
      const row = {
        ...input,
        id: input.id ?? crypto.randomUUID(),
        qualificationId: input.qualificationId ?? null,
        effectiveTo: input.effectiveTo ?? null,
        note: input.note ?? null,
        updatedAt: new Date().toISOString(),
      };
      const index = staffing.requirements.findIndex((item) => item.id === row.id);
      if (index >= 0) staffing.requirements[index] = row;
      else staffing.requirements.push(row);
      return row;
    }
    if (url.pathname.includes('/requirements/') && method === 'DELETE') {
      const id = url.pathname.split('/').at(-1);
      staffing.requirements = staffing.requirements.filter((item) => item.id !== id);
      return {};
    }
    if (url.pathname.endsWith('/qualifications') && method === 'POST') {
      const input = body as { siteId: string; code: string; name: string };
      const row = { id: crypto.randomUUID(), ...input, isActive: true };
      staffing.qualifications.push(row);
      return row;
    }
    if (url.pathname.endsWith('/holdings') && method === 'POST') {
      const input = body as (typeof staffing.holdings)[number];
      const row = {
        ...input,
        id: crypto.randomUUID(),
        validUntil: input.validUntil ?? null,
        note: input.note ?? null,
        recordedAt: new Date().toISOString(),
      };
      staffing.holdings.push(row);
      return row;
    }
    if (url.pathname.includes('/holdings/') && method === 'DELETE') {
      const id = url.pathname.split('/').at(-1);
      staffing.holdings = staffing.holdings.filter((item) => item.id !== id);
      return {};
    }
  }
  if (url.pathname === '/admin/schedules/commands') {
    const command = ScheduleWebCommand.parse(body);
    const stored = commandReceipts.get(command.commandId);
    if (stored) return stored;
    const actionPaths = {
      SAVE: 'assignments',
      SUBMIT: 'submit',
      RETURN: 'return',
      PUBLISH: 'publish',
      REVISE: 'revise',
    };
    const path =
      command.action === 'CREATE'
        ? '/admin/schedules'
        : `/admin/schedules/${command.versionId}${command.action === 'DELETE' ? '' : `/${actionPaths[command.action]}`}`;
    const payload =
      command.action === 'CREATE'
        ? command.payload
        : {
            ...('payload' in command ? command.payload : {}),
            expectedRevision: command.expectedRevision,
          };
    const value = scheduleFixture(
      new URL(path, url),
      command.action === 'DELETE' ? 'DELETE' : command.action === 'SAVE' ? 'PUT' : 'POST',
      payload,
    );
    if (value instanceof Response) return value;
    const result = ScheduleCommandResult.parse(
      command.action === 'DELETE'
        ? { commandId: command.commandId, kind: 'DELETED', versionId: command.versionId }
        : command.action === 'SAVE'
          ? { commandId: command.commandId, kind: 'DETAIL', detail: value }
          : { commandId: command.commandId, kind: 'VERSION', version: value },
    );
    commandReceipts.set(command.commandId, structuredClone(result));
    if (simulateLostResponse && !lostResponseInjected) {
      lostResponseInjected = true;
      throw new TypeError('Synthetic response lost after commit');
    }
    return result;
  }
  if (url.pathname.endsWith('/templates')) return scheduleTemplates;
  if (url.pathname === '/admin/schedules') {
    if (method === 'GET')
      return versions
        .filter(
          (v) =>
            v.orgUnitId === url.searchParams.get('orgUnitId') &&
            v.periodMonth === url.searchParams.get('periodMonth'),
        )
        .toReversed();
    const input = CreateScheduleVersionCommand.parse(body);
    const version = create(input.orgUnitId, input.periodMonth);
    const source = versions.find((v) =>
      input.basedOnVersionId
        ? v.id === input.basedOnVersionId
        : v.status === 'PUBLISHED' &&
          v.orgUnitId === input.orgUnitId &&
          v.periodMonth === input.periodMonth,
    );
    const items = source ? (assignments.get(source.id) ?? []) : [];
    assignments.set(version.id, items);
    version.assignmentsCount = items.length;
    versions.push(version);
    return version;
  }
  const [, , , id, action] = url.pathname.split('/');
  const version = versions.find((v) => v.id === id);
  if (!version) return null;
  if (action === 'history') {
    const page = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
    const entries = [
      {
        id: 'f0000000-0000-4000-8000-000000000001',
        at: version.publishedAt ?? version.createdAt,
        actorType: 'WEB_USER',
        actorId: null,
        actorLabel: 'Preview planner',
        reason:
          'Coverage reviewed for both shifts.\nThe recorded decision remains available in full.',
        action: 'PUBLISH',
        fromStatus: 'IN_REVIEW',
        toStatus: 'PUBLISHED',
      },
      {
        id: 'f0000000-0000-4000-8000-000000000002',
        at: version.createdAt,
        actorType: 'WEB_USER',
        actorId: null,
        actorLabel: 'Preview planner',
        reason: null,
        action: 'SAVE',
        assignmentCount: version.assignmentsCount,
      },
      {
        id: 'f0000000-0000-4000-8000-000000000003',
        at: version.createdAt,
        actorType: 'SYSTEM',
        actorId: null,
        actorLabel: null,
        reason: null,
        action: 'CREATE',
        basedOnVersionId: null,
      },
    ];
    return {
      versionId: id,
      page,
      pageSize,
      total: entries.length,
      entries: entries.slice((page - 1) * pageSize, page * pageSize),
      lineage: { supersedes: null, supersededBy: null },
    };
  }
  if (
    method === 'DELETE' ||
    ['assignments', 'submit', 'return', 'publish', 'revise'].includes(action ?? '')
  ) {
    if (simulateStaleSave && !staleSaveInjected && action === 'assignments') {
      version.revision += 1;
      staleSaveInjected = true;
    }
    const precondition = ScheduleRevisionPrecondition.parse(body);
    if (precondition.expectedRevision !== version.revision) {
      return new Response(
        JSON.stringify({ code: 'SCHEDULE_REVISION_CONFLICT', message: 'Stale schedule revision' }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      );
    }
    version.revision += 1;
  }
  if (action === 'assignments') {
    const input = PutAssignmentsCommand.parse(body);
    assignments.set(version.id, input.items);
    version.assignmentsCount = input.items.length;
    return detail(version);
  }
  if (action === 'submit') {
    version.status = 'IN_REVIEW';
    version.deletable = false;
    return version;
  }
  if (action === 'return') {
    version.status = 'DRAFT';
    version.deletable = true;
    return version;
  }
  if (action === 'publish' || action === 'revise') {
    let target = version;
    if (action === 'revise') {
      const input = ReviseScheduleCommand.parse(body);
      target = create(version.orgUnitId, version.periodMonth);
      assignments.set(target.id, input.items);
      target.assignmentsCount = input.items.length;
      versions.push(target);
    }
    for (const value of versions)
      if (
        value.status === 'PUBLISHED' &&
        value.orgUnitId === target.orgUnitId &&
        value.periodMonth === target.periodMonth
      ) {
        value.status = 'SUPERSEDED';
        value.deletable = true;
        target.supersedesId = value.id;
      }
    target.status = 'PUBLISHED';
    target.deletable = false;
    target.publishedAt = new Date().toISOString();
    return target;
  }
  if (method === 'DELETE') {
    versions.splice(versions.indexOf(version), 1);
    assignments.delete(version.id);
    return {};
  }
  return detail(version);
}
