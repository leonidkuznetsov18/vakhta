import { planInstants } from '@vakhta/domain';
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
      const instants = planInstants(item.businessDate, template, 'Europe/Kyiv');
      return {
        ...item,
        id: crypto.randomUUID(),
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
  ],
  otherUnitEmployees: [] as { employeeId: string; orgUnitId: string }[],
};
/** In-memory preview only: exercises the actual validated frontend contract, never production. */
export function scheduleFixture(url: URL, method: string, body: unknown): unknown {
  if (url.pathname.startsWith('/admin/schedules/staffing')) {
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
