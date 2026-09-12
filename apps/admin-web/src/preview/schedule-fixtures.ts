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
/** In-memory preview only: exercises the actual validated frontend contract, never production. */
export function scheduleFixture(url: URL, method: string, body: unknown): unknown {
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
