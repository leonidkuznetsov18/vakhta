import { stubFetch } from '@/test/stub-fetch';
import { AssignmentChanges } from './assignment-changes';
import { assignmentAcknowledgement } from '../model/acknowledgement';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import {
  EmployeeView,
  ZoneView,
  ScheduleVersionDetail,
  ScheduleWebCommand,
  ScheduleCommandResult,
} from '@vakhta/contracts';
import { setUiState, uiState } from '@/lib/ui-store';
import { gridFromDetail, gridToItems, setAssignment, setCell } from '../model/grid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
  render as renderRaw,
} from '@testing-library/react';
import { render } from '@/test-utils';
import { ScheduleWorkspace as SchedulePage } from './schedule-workspace';
import { scheduleDraftKey } from '../model/ownership';
import { scheduleCommands, createCommandQueue } from '../model/commands';
import { useScheduleDrafts } from '../model/store';
import { writeSchedulePreset } from '../model/preset';
import { clearPersistentState } from '@/lib/ui-store';
import { notifySuccess } from '@/lib/toast';
import { NavigationProvider } from '@/navigation';

beforeEach(() => {
  // The fixtures plan September 2026 around "today" = 13 September (the week 7–13 on screen,
  // 5 September one step back); only the clock is faked so timers and waits stay real.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-13T09:00:00+03:00'));
  vi.stubGlobal('navigator', {
    locks: { request: async (_name: string, action: () => unknown) => action() },
  });
  localStorage.removeItem('vakhta.ui.schedule.commands.v1');
  scheduleCommands.setState({ pending: {}, recoveryError: false, storageError: false });
});

vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => viewport.mobile }));

const SITE = 'a0000000-0000-4000-8000-000000000001';
const UNIT = 'a0000000-0000-4000-8000-000000000002';
const ZONE = 'a0000000-0000-4000-8000-000000000003';
const EMP = 'b0000000-0000-4000-8000-000000000001';
const EMP2 = 'b0000000-0000-4000-8000-000000000002';
const TPL_DAY = 'c0000000-0000-4000-8000-000000000001';
const TPL_NIGHT = 'c0000000-0000-4000-8000-000000000002';
const VERSION = 'd0000000-0000-4000-8000-000000000001';
const ACTOR = 'f0000000-0000-4000-8000-000000000001';
const DRAFT_KEY = scheduleDraftKey(ACTOR, SITE, UNIT, '2026-09', VERSION);
const ASSIGN = 'e0000000-0000-4000-8000-000000000001';

const org = {
  sites: [{ id: SITE, code: 'main', name: 'Основная площадка', timezone: 'Europe/Moscow' }],
  orgUnits: [{ id: UNIT, siteId: SITE, parentId: null, name: 'Цех фасовки' }],
  teams: [],
  positions: [],
  zones: [
    {
      id: ZONE,
      siteId: SITE,
      orgUnitId: UNIT,
      code: 'L1',
      name: 'Линия 1',
      type: 'AREA',
      isShared: false,
      isActive: true,
    },
  ],
  terminals: [],
  reasonCodes: [],
};

const employees = [
  {
    id: EMP,
    personnelNumber: '0001',
    fullName: 'Кузнецов Леонид',
    status: 'ACTIVE',
    telegramLinked: true,
    currentPosition: null,
    email: null,
    phone: null,
    telegramUsername: null,
    createdAt: '2026-09-01T00:00:00Z',
  },
  {
    id: EMP2,
    personnelNumber: '0002',
    fullName: 'Сидоров Пётр',
    status: 'ACTIVE',
    telegramLinked: false,
    currentPosition: null,
    email: null,
    phone: null,
    telegramUsername: null,
    createdAt: '2026-09-01T00:00:00Z',
  },
];

const templates = [
  {
    id: TPL_DAY,
    siteId: SITE,
    code: 'DAY',
    name: 'Дневная',
    localStart: '08:00',
    localEnd: '20:00',
    isNight: false,
    isActive: true,
  },
  {
    id: TPL_NIGHT,
    siteId: SITE,
    code: 'NIGHT',
    name: 'Ночная',
    localStart: '20:00',
    localEnd: '08:00',
    isNight: true,
    isActive: true,
  },
];

function version(status: string, assignmentsCount = 1) {
  return {
    id: VERSION,
    siteId: SITE,
    orgUnitId: UNIT,
    periodMonth: '2026-09',
    versionNo: 1,
    revision: 1,
    status,
    createdBy: null,
    submittedAt: null,
    approvedBy: null,
    publishedAt: null,
    supersedesId: null,
    changeReason: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    assignmentsCount,
    deletable: status === 'DRAFT' || status === 'SUPERSEDED',
  };
}

function detail(status: string) {
  return {
    version: version(status),
    assignments: [
      {
        id: ASSIGN,
        scheduleVersionId: VERSION,
        employeeId: EMP,
        templateId: TPL_NIGHT,
        templateCode: 'NIGHT',
        businessDate: '2026-09-05',
        planStartAt: '2026-09-05T17:00:00.000Z',
        planEndAt: '2026-09-06T05:00:00.000Z',
        positionId: null,
        orgUnitId: UNIT,
        teamId: null,
        zoneId: ZONE,
        kind: 'REGULAR',
        status: 'PLANNED',
        acknowledgedAt: null,
        customStart: null,
        customEnd: null,
        segments: [],
        breaks: [],
      },
    ],
  };
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function mockApi(
  state: {
    status: string;
    created?: boolean;
    createdFrom?: boolean;
    revision?: number;
    conflict?: boolean;
    legacyApi?: boolean;
    saveGate?: Promise<void>;
    lostResponse?: boolean;
    savedDetail?: ScheduleVersionDetail;
    slots?: Record<string, unknown>[];
    operations?: Record<string, unknown>;
    events?: Record<string, unknown>;
    notes?: Record<string, unknown>[];
    retrospective?: Record<string, unknown>;
    october?: ScheduleVersionDetail;
    staffing?: {
      requirements: unknown[];
      qualifications: unknown[];
      holdings: unknown[];
    };
    context?: { intervals: unknown[]; absences: unknown[]; otherUnitEmployees: unknown[] };
    candidates?: unknown[];
    patterns?: unknown[];
    readGate?: Promise<void>;
    templatesEmpty?: boolean;
    templatesFail?: boolean;
    listFail?: boolean;
    contextFail?: boolean;
  },
  snapshot: typeof org = org,
  roster = employees,
) {
  const calls: Call[] = [];
  const receipts = new Map<string, ScheduleCommandResult>();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(String(input));
    const requestMethod = init?.method ?? 'GET';
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: requestMethod, path: requestUrl.pathname + requestUrl.search, body });
    const command =
      requestUrl.pathname === '/admin/schedules/commands' ? ScheduleWebCommand.parse(body) : null;
    if (command && state.legacyApi)
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    const receipt = command && receipts.get(command.commandId);
    if (receipt)
      return new Response(JSON.stringify(receipt), {
        headers: { 'content-type': 'application/json' },
      });
    const actionPaths = {
      SAVE: 'assignments',
      SUBMIT: 'submit',
      RETURN: 'return',
      PUBLISH: 'publish',
      REVISE: 'revise',
    };
    const path = command
      ? command.action === 'CREATE'
        ? '/admin/schedules'
        : `/admin/schedules/${command.versionId}${command.action === 'DELETE' ? '' : `/${actionPaths[command.action]}`}`
      : requestUrl.pathname + requestUrl.search;
    const method =
      command?.action === 'SAVE' ? 'PUT' : command?.action === 'DELETE' ? 'DELETE' : requestMethod;
    const url = new URL(path, requestUrl);
    const json = (data: unknown, status = 200) => {
      let response = data;
      if (command && status < 400) {
        const result = ScheduleCommandResult.parse(
          command.action === 'SAVE'
            ? { commandId: command.commandId, kind: 'DETAIL', detail: data }
            : command.action === 'DELETE'
              ? { commandId: command.commandId, kind: 'DELETED', versionId: command.versionId }
              : { commandId: command.commandId, kind: 'VERSION', version: data },
        );
        receipts.set(command.commandId, result);
        if (state.lostResponse) {
          state.lostResponse = false;
          throw new TypeError('Response lost after commit');
        }
        response = result;
      }
      return new Response(JSON.stringify(response), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    };
    if (method === 'GET' && state.readGate) await state.readGate;
    if (path === '/admin/org') return json(snapshot);
    if (url.pathname === '/admin/employees/page') {
      const after = url.searchParams.get('after');
      const remaining = roster.filter((employee) => !after || employee.id > after);
      const items = remaining.slice(0, 200);
      return json({
        items,
        total: roster.length,
        nextCursor: remaining.length > 200 ? items.at(-1)?.id : null,
      });
    }
    if (path.startsWith('/admin/schedules/notes')) {
      state.notes ??= [];
      if (method === 'GET') return json(state.notes);
      if (method === 'POST') {
        const row = {
          ...(body as object),
          id: 'b7000000-0000-4000-8000-000000000001',
          createdBy: ACTOR,
          createdAt: '2026-09-01T10:00:00.000Z',
        };
        state.notes.push(row);
        return json(row);
      }
      state.notes = [];
      return new Response(null, { status: 204 });
    }
    if (path.startsWith('/admin/schedules/reports/retrospective'))
      return json(
        state.retrospective ?? {
          generatedAt: '2026-09-05T10:00:00.000Z',
          timezone: 'Europe/Kyiv',
          periodMonth: '2026-09',
          siteId: SITE,
          orgUnitId: UNIT,
          version: { id: VERSION, versionNo: 1, publishedAt: '2026-08-31T10:00:00.000Z' },
          rows: [
            {
              assignmentId: ASSIGN,
              employeeId: EMP,
              businessDate: '2026-09-05',
              zoneId: ZONE,
              plannedStartAt: '2026-09-05T17:00:00.000Z',
              plannedEndAt: '2026-09-06T05:00:00.000Z',
              plannedMinutes: 720,
              sessionId: 'c7000000-0000-4000-8000-000000000001',
              recordedStartAt: '2026-09-05T17:03:00.000Z',
              recordedEndAt: '2026-09-06T05:00:00.000Z',
              workMinutes: 610,
              totalMinutes: 717,
              departure: 'UNKNOWN',
              autoCloseReason: 'NO_CHECKLIST',
            },
          ],
          totals: [
            {
              employeeId: EMP,
              shifts: 1,
              plannedMinutes: 720,
              workMinutes: 610,
              recordedShifts: 1,
              unknownDepartures: 1,
              missingActuals: 0,
            },
          ],
        },
      );
    if (path.startsWith('/admin/schedules/open-slots')) {
      const [, , , , id, action] = path.split('?')[0]!.split('/');
      state.slots ??= [];
      if (method === 'GET') return json(state.slots);
      if (method === 'POST' && !id) {
        const row = {
          ...(body as object),
          id: 'f1000000-0000-4000-8000-000000000001',
          status: 'OPEN',
          filledEmployeeId: null,
          filledVersionId: null,
          offer: null,
          offerCount: 0,
          createdAt: '2026-09-01T00:00:00.000Z',
        };
        state.slots.push(row);
        return json(row);
      }
      const slot = state.slots.find((item) => item.id === id)!;
      if (action === 'offer') {
        Object.assign(slot, {
          status: 'OFFERED',
          offer: {
            id: 'f2000000-0000-4000-8000-000000000001',
            status: 'OPEN',
            audience: (body as { audience: string }).audience,
            notifiedCount: 2,
            offeredAt: '2026-09-01T10:00:00.000Z',
            closedAt: null,
            interests: [
              {
                employeeId: EMP2,
                response: 'INTERESTED',
                respondedAt: '2026-09-01T11:00:00.000Z',
              },
            ],
          },
          offerCount: 1,
        });
        return json(slot);
      }
      if (action === 'select') {
        Object.assign(slot, {
          status: 'FILLED',
          filledEmployeeId: (body as { employeeId: string }).employeeId,
        });
        return json({ slot, detail: state.savedDetail ?? detail(state.status) });
      }
      Object.assign(slot, { status: action === 'cancel' ? 'CANCELLED' : 'OPEN' });
      return json(slot);
    }
    if (path.startsWith('/admin/schedules/patterns')) {
      if (method === 'POST')
        return json({ ...(body as object), id: SITE, createdAt: '2026-09-01T00:00:00.000Z' });
      return json(state.patterns ?? []);
    }
    if (path.startsWith('/admin/schedules/staffing/events'))
      return json(
        state.events ?? {
          region: 'UA',
          holidays: [],
          birthdays: [],
          absences: [],
          replacements: [],
        },
      );
    if (path.startsWith('/admin/schedules/staffing/attention'))
      return json({
        today: '2026-09-05',
        holiday: null,
        birthdaysToday: [],
        onSickLeave: [],
        replacements: [],
      });
    if (path.startsWith('/admin/schedules/staffing/operations'))
      return json(
        state.operations ?? {
          fetchedAt: '2026-09-05T10:00:00.000Z',
          presence: [],
          requests: [],
        },
      );
    if (path.startsWith('/admin/schedules/staffing/context'))
      return state.contextFail
        ? json({ message: 'Context read failed' }, 500)
        : json(state.context ?? { intervals: [], absences: [], otherUnitEmployees: [] });
    if (path.startsWith('/admin/schedules/staffing/candidates'))
      return json(state.candidates ?? []);
    if (path.startsWith('/admin/schedules/staffing'))
      return json({
        rules: {
          siteId: SITE,
          minRestMinutes: 660,
          maxMonthMinutes: 12000,
          restSeverity: 'WARN',
          hoursSeverity: 'WARN',
          configured: false,
        },
        availability: [],
        ...(state.staffing ?? { requirements: [], qualifications: [], holdings: [] }),
      });
    if (path.startsWith('/admin/schedules/templates'))
      return state.templatesFail
        ? json({ message: 'Template read failed' }, 500)
        : json(state.templatesEmpty ? [] : templates);
    if (path.startsWith('/admin/schedules?')) {
      if (state.listFail) return json({ message: 'Version read failed' }, 500);
      const periodMonth = url.searchParams.get('periodMonth');
      if (periodMonth !== '2026-09')
        return json(periodMonth === '2026-10' && state.october ? [state.october.version] : []);
      const list =
        state.status === 'EMPTY' && !state.created
          ? []
          : [version(state.status === 'EMPTY' ? 'DRAFT' : state.status)];
      // Once a draft has been created it is part of the month, like it would be on the server.
      if (state.created) {
        list.unshift({
          ...version('DRAFT'),
          id: 'd0000000-0000-4000-8000-000000000002',
          versionNo: 2,
          supersedesId: null,
        });
      }
      return json(list);
    }
    if (path === '/admin/schedules' && method === 'POST') {
      state.created = true;
      state.createdFrom = command?.action === 'CREATE' && !!command.payload.basedOnVersionId;
      const created = {
        ...version('DRAFT'),
        id: 'd0000000-0000-4000-8000-000000000002',
        versionNo: 2,
        supersedesId: null,
      };
      return json(
        state.legacyApi
          ? Object.fromEntries(Object.entries(created).filter(([key]) => key !== 'revision'))
          : created,
        201,
      );
    }
    if (path === '/admin/schedules/d0000000-0000-4000-8000-000000000002') {
      const d = detail('DRAFT');
      return json({
        ...d,
        version: {
          ...d.version,
          id: 'd0000000-0000-4000-8000-000000000002',
          versionNo: 2,
          revision: state.legacyApi ? 0 : 1,
        },
        assignments: state.createdFrom
          ? d.assignments.map((item) => ({
              ...item,
              scheduleVersionId: 'd0000000-0000-4000-8000-000000000002',
            }))
          : [],
      });
    }
    if (url.pathname === `/admin/schedules/${VERSION}/history`) {
      const page = Number(url.searchParams.get('page'));
      const pageSize = Number(url.searchParams.get('pageSize'));
      const entries = Array.from({ length: 21 }, (_, index) => ({
        id: `f0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        at: '2026-09-01T12:00:00Z',
        actorType: 'WEB_USER',
        actorId: ACTOR,
        actorLabel: 'Recorded reviewer',
        reason: `Original decision ${index + 1}\nFull reason retained`,
        action: 'RETURN',
        fromStatus: 'IN_REVIEW',
        toStatus: 'DRAFT',
      }));
      return json({
        versionId: VERSION,
        page,
        pageSize,
        total: entries.length,
        entries: entries.slice((page - 1) * pageSize, page * pageSize),
        lineage: { supersedes: null, supersededBy: null },
      });
    }
    if (state.october && path === `/admin/schedules/${state.october.version.id}`)
      return json(state.october);
    if (path === `/admin/schedules/${VERSION}`) {
      const result = state.savedDetail ?? detail(state.status);
      return json({
        ...result,
        version: state.legacyApi
          ? Object.fromEntries(Object.entries(result.version).filter(([key]) => key !== 'revision'))
          : { ...result.version, revision: state.revision ?? 1 },
      });
    }
    if (path === `/admin/schedules/${VERSION}/assignments` && method === 'PUT') {
      await state.saveGate;
      if (state.conflict) {
        state.revision = 2;
        return json({ code: 'SCHEDULE_REVISION_CONFLICT', message: 'Stale revision' }, 409);
      }
      if (command?.action === 'SAVE') {
        state.revision = (state.revision ?? 1) + 1;
        state.savedDetail = ScheduleVersionDetail.parse({
          version: {
            ...version(state.status, command.payload.items.length),
            revision: state.revision,
          },
          assignments: command.payload.items.map((item) => ({
            ...detail(state.status).assignments[0],
            ...item,
            id: crypto.randomUUID(),
            scheduleVersionId: VERSION,
            orgUnitId: UNIT,
            templateCode: item.templateId === TPL_DAY ? 'DAY' : 'NIGHT',
            positionId: item.positionId ?? null,
            teamId: item.teamId ?? null,
            zoneId: item.zoneId ?? null,
            status: 'PLANNED',
            acknowledgedAt: null,
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
            planStartAt: `${item.businessDate}T05:00:00.000Z`,
            planEndAt: `${item.businessDate}T17:00:00.000Z`,
          })),
        });
      }
      return json(state.savedDetail ?? detail(state.status));
    }
    if (path === `/admin/schedules/${VERSION}/submit`) {
      state.status = 'IN_REVIEW';
      return json(version('IN_REVIEW'));
    }
    if (path === `/admin/schedules/${VERSION}/publish`) {
      state.status = 'PUBLISHED';
      return json(version('PUBLISHED'));
    }
    if (path === `/admin/schedules/${VERSION}/revise`) {
      return json({
        ...version('PUBLISHED'),
        id: 'd0000000-0000-4000-8000-000000000002',
        versionNo: 2,
        supersedesId: VERSION,
      });
    }
    if (path === `/admin/schedules/${VERSION}/acknowledgements`) {
      return json([
        {
          employeeId: EMP,
          fullName: 'Кузнецов Леонид',
          personnelNumber: '0001',
          assignments: 1,
          acknowledged: 0,
          telegramLinked: true,
        },
      ]);
    }
    return json({ code: 'NOT_FOUND', message: path }, 404);
  });
  stubFetch(fetchMock);
  return calls;
}

function commands(calls: Call[]) {
  return calls.flatMap((call) => {
    const parsed = ScheduleWebCommand.safeParse(call.body);
    return parsed.success ? [parsed.data] : [];
  });
}
function saves(calls: Call[]) {
  return commands(calls).filter((command) => command.action === 'SAVE');
}
function revisions(calls: Call[]) {
  return commands(calls).filter((command) => command.action === 'REVISE');
}
const t = messages(currentLocale()).scheduleWorkspace;
const s = messages(currentLocale()).admin.schedule;
function account(actorId = ACTOR, go: (section: string) => void = () => undefined) {
  return (
    <NavigationProvider
      actorId={actorId}
      go={go as never}
      roles={['ADMIN']}
      grants={[{ role: 'ADMIN', scopeType: 'ENTERPRISE', scopeId: null }]}
    >
      <SchedulePage />
    </NavigationProvider>
  );
}
/**
 * Walks the period back until a card with this name is on screen. Each click is awaited: the
 * toolbar ignores clicks while a week loads, and a synchronous loop would spin forever there.
 */
async function showWeekOf(name: RegExp): Promise<HTMLElement> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // The card may arrive a tick after the week does (the plan of a touched month loads).
    const found = await screen.findByRole('button', { name }, { timeout: 600 }).catch(() => null);
    if (found) return found;
    const previous = screen.getByRole('button', { name: t.previous });
    const before = previous.parentElement?.textContent;
    fireEvent.click(previous);
    await waitFor(() => expect(previous.parentElement?.textContent).not.toBe(before)).catch(
      () => undefined,
    );
  }
  return screen.findByRole('button', { name });
}
function admin(go?: (section: string) => void) {
  return render(account(ACTOR, go));
}
describe('schedule workspace', () => {
  beforeEach(() => {
    viewport.mobile = false;
    useScheduleDrafts.setState({
      drafts: {},
      baselines: {},
      revisions: {},
      past: {},
      future: {},
      recoveryError: false,
    });
    clearPersistentState();
    setUiState({ 'schedule.month': '2026-09' });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  it('shows metadata-only before and after differences with directory labels', () => {
    const before = gridToItems(gridFromDetail(ScheduleVersionDetail.parse(detail('PUBLISHED'))))[0];
    if (!before) throw new Error('Missing assignment fixture');
    render(
      <AssignmentChanges
        labels={{
          employees: EmployeeView.array().parse(employees),
          templates,
          zones: ZoneView.array().parse(org.zones),
          org: {
            teams: [{ id: UNIT, orgUnitId: UNIT, name: 'Relief team' }],
            positions: [{ id: SITE, code: 'P1', name: 'Relief position' }],
          },
        }}
        changes={[
          {
            key: 'metadata',
            type: 'changed',
            before,
            after: { ...before, kind: 'EXTRA', teamId: UNIT, positionId: SITE },
          },
        ]}
      />,
    );
    expect(screen.getByText(new RegExp(t.kindRegular))).toBeTruthy();
    const after = screen.getByText(/Relief team/);
    expect(after.textContent).toContain(t.kindExtra);
    expect(after.textContent).toContain('Relief position');
  });
  it('shows acknowledgement only for the unchanged published assignment and matching version', () => {
    const saved = ScheduleVersionDetail.parse(detail('PUBLISHED'));
    const first = saved.assignments[0];
    if (!first) throw new Error('Missing assignment fixture');
    first.acknowledgedAt = '2026-09-02T10:00:00Z';
    const assignment = gridToItems(gridFromDetail(saved))[0];
    if (!assignment) throw new Error('Missing grid fixture');
    const input = {
      assignment,
      recorded: saved.assignments,
      version: saved.version,
      timezone: 'Europe/Moscow',
    };
    expect(assignmentAcknowledgement(input)).toContain(t.acknowledged);
    expect(
      assignmentAcknowledgement({ ...input, recorded: [{ ...first, acknowledgedAt: null }] }),
    ).toBe(t.notAcknowledged);
    for (const change of [
      { kind: 'EXTRA' as const },
      { zoneId: UNIT },
      { teamId: UNIT },
      { positionId: SITE },
      { templateId: TPL_DAY },
    ]) {
      expect(
        assignmentAcknowledgement({ ...input, assignment: { ...assignment, ...change } }),
      ).toBe(t.acknowledgeAfterPublish);
    }
    expect(
      assignmentAcknowledgement({ ...input, version: { ...saved.version, status: 'DRAFT' } }),
    ).toBe(t.acknowledgeAfterPublish);
    expect(
      assignmentAcknowledgement({ ...input, recorded: [{ ...first, scheduleVersionId: UNIT }] }),
    ).toBe(t.acknowledgeAfterPublish);
  });
  it('shows one loading surface for simultaneous workspace reads without inventing empty data', async () => {
    let resolveReads: () => void = () => undefined;
    const readGate = new Promise<void>((resolve) => {
      resolveReads = resolve;
    });
    mockApi({ status: 'DRAFT', readGate });
    admin();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByText(t.empty)).toBeNull();
    expect(screen.queryByText(t.missingTemplates)).toBeNull();
    await act(async () => {
      resolveReads();
      await readGate;
    });
    await screen.findByText(t.draftState);
    expect(screen.queryByRole('status')).toBeNull();
  });
  it.each([false, true])(
    'distinguishes missing templates from a failed read (failure %s)',
    async (templatesFail) => {
      mockApi({ status: 'DRAFT', templatesEmpty: true, templatesFail });
      admin();
      await screen.findByText(t.draftState);
      if (templatesFail) {
        await screen.findByRole('button', { name: messages(currentLocale()).ui.common.retry });
        expect(screen.queryByText(t.missingTemplates)).toBeNull();
      } else expect(await screen.findByText(t.missingTemplates)).toBeTruthy();
    },
  );
  it('disables creating a schedule after its version list fails and recovers on retry', async () => {
    const state = { status: 'EMPTY', listFail: false };
    const calls = mockApi(state);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    renderRaw(account(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    const button = await screen.findByRole('button', { name: t.create });
    expect(button.hasAttribute('disabled')).toBe(false);
    state.listFail = true;
    await act(async () => {
      await client.invalidateQueries();
    });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(true));
    fireEvent.click(button);
    expect(commands(calls)).toHaveLength(0);
    state.listFail = false;
    fireEvent.click(
      screen.getByRole('button', { name: messages(currentLocale()).ui.common.retry }),
    );
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    client.clear();
  });
  it('reports a failed first version list read instead of an empty month', async () => {
    mockApi({ status: 'EMPTY', listFail: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    renderRaw(account(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    expect(
      await screen.findByRole('button', { name: messages(currentLocale()).ui.common.retry }),
    ).toBeTruthy();
    expect(screen.queryByText(t.empty)).toBeNull();
    client.clear();
  });
  it('isolates local edits and server reads when the signed-in account changes', async () => {
    const calls = mockApi({ status: 'DRAFT' });
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
    useScheduleDrafts.getState().keep(DRAFT_KEY, local, saved, 1);
    writeSchedulePreset({
      actorId: ACTOR,
      orgUnitId: UNIT,
      month: '2026-09',
      people: [{ id: EMP2, name: 'Private preset person' }],
    });
    const page = admin();
    expect(await screen.findByRole('button', { name: `${s.save} (1)` })).toBeTruthy();
    const reads = calls.filter((call) => call.path === `/admin/schedules/${VERSION}`).length;
    page.rerender(account('f0000000-0000-4000-8000-000000000002'));
    expect(screen.queryByText(/Private preset person/)).toBeNull();
    await screen.findByRole('button', { name: t.reviewPublish });
    expect(screen.queryByRole('button', { name: `${s.save} (1)` })).toBeNull();
    expect(
      calls.filter((call) => call.path === `/admin/schedules/${VERSION}`).length,
    ).toBeGreaterThan(reads);
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
    page.rerender(account());
    expect(await screen.findByRole('button', { name: `${s.save} (1)` })).toBeTruthy();
  });

  it('retains unowned legacy edits without opening their content for the current account', async () => {
    mockApi({ status: 'DRAFT' });
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
    useScheduleDrafts.getState().keep(VERSION, local, saved, 1);
    admin();
    expect(await screen.findByText(t.unownedDraft)).toBeTruthy();
    await screen.findByRole('button', { name: t.reviewPublish });
    expect(screen.queryByRole('button', { name: `${s.save} (1)` })).toBeNull();
    expect(useScheduleDrafts.getState().drafts[VERSION]).toEqual(local);
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toBeUndefined();
  });

  it('ignores a successful write response after the account changes', async () => {
    let finishSave: () => void = () => undefined;
    const saveGate = new Promise<void>((resolve) => {
      finishSave = () => resolve();
    });
    const calls = mockApi({ status: 'DRAFT', saveGate });
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
    useScheduleDrafts.getState().keep(DRAFT_KEY, local, saved, 1);
    const page = admin();
    fireEvent.click(await screen.findByRole('button', { name: `${s.save} (1)` }));
    await waitFor(() => expect(saves(calls).length > 0).toBe(true));
    page.rerender(account('f0000000-0000-4000-8000-000000000002'));
    await screen.findByRole('button', { name: t.reviewPublish });
    vi.mocked(notifySuccess).mockClear();
    await act(async () => {
      finishSave();
      await saveGate;
    });
    expect(screen.queryByRole('button', { name: `${s.save} (1)` })).toBeNull();
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it('ignores the old workspace response after switching accounts and returning to its warm cache', async () => {
    let finishSave: () => void = () => undefined;
    const saveGate = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const calls = mockApi({ status: 'DRAFT', saveGate });
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
    useScheduleDrafts.getState().keep(DRAFT_KEY, local, saved, 1);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 300_000, staleTime: 30_000 } },
    });
    const page = renderRaw(account(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    fireEvent.click(await screen.findByRole('button', { name: `${s.save} (1)` }));
    await waitFor(() => expect(saves(calls).length > 0).toBe(true));
    page.rerender(account('f0000000-0000-4000-8000-000000000002'));
    await screen.findByRole('button', { name: t.reviewPublish });
    page.rerender(account());
    await screen.findByRole('button', { name: `${s.save} (1)` });
    vi.mocked(notifySuccess).mockClear();
    await act(async () => {
      finishSave();
      await saveGate;
    });
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
    expect(notifySuccess).not.toHaveBeenCalled();
    client.clear();
  });

  it('recovers a lost save response after reload using the original durable identity', async () => {
    const calls = mockApi({ status: 'DRAFT', lostResponse: true });
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
    useScheduleDrafts.getState().keep(DRAFT_KEY, local, saved, 1);
    const page = admin();
    fireEvent.click(await screen.findByRole('button', { name: `${s.save} (1)` }));
    await screen.findByRole('button', { name: t.commandRetry });
    expect(saves(calls)).toHaveLength(1);
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
    page.unmount();
    const restored = createCommandQueue(() => localStorage).getState();
    act(() => scheduleCommands.setState({ pending: restored.pending }));
    admin();
    fireEvent.click(await screen.findByRole('button', { name: t.commandRetry }));
    await waitFor(() => expect(screen.queryByText(t.commandUnconfirmed)).toBeNull());
    expect(saves(calls)).toHaveLength(2);
    expect(saves(calls)[1]).toEqual(saves(calls)[0]);
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toBeUndefined();
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
  });

  it('retains newer local edits when resolving an earlier committed save', async () => {
    const calls = mockApi({ status: 'DRAFT', lostResponse: true });
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
    useScheduleDrafts.getState().keep(DRAFT_KEY, local, saved, 1);
    admin();
    fireEvent.click(await screen.findByRole('button', { name: `${s.save} (1)` }));
    await screen.findByRole('button', { name: t.commandRetry });
    const newer = setCell(local, EMP, '2026-09-06', TPL_NIGHT);
    act(() => useScheduleDrafts.getState().keep(DRAFT_KEY, newer, saved, 1));
    fireEvent.click(screen.getByRole('button', { name: t.commandRetry }));
    await waitFor(() => expect(screen.queryByText(t.commandUnconfirmed)).toBeNull());
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(newer);
    expect(await screen.findByText(t.stale)).toBeTruthy();
    expect(saves(calls)[1]).toEqual(saves(calls)[0]);
  });

  it('resolves an uncertain create after remount without creating a new command', async () => {
    const calls = mockApi({ status: 'EMPTY', lostResponse: true });
    const page = admin();
    fireEvent.click(await screen.findByRole('button', { name: t.create }));
    await screen.findByRole('button', { name: t.commandRetry });
    page.unmount();
    admin();
    await screen.findByRole('button', { name: t.commandRetry });
    expect(commands(calls)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: t.commandRetry }));
    await waitFor(() => expect(screen.queryByText(t.commandUnconfirmed)).toBeNull());
    expect(commands(calls)).toHaveLength(2);
    expect(commands(calls)[1]).toEqual(commands(calls)[0]);
    expect(calls.some((call) => call.path.endsWith('d0000000-0000-4000-8000-000000000002'))).toBe(
      true,
    );
  });

  it('admits only one command for duplicate save taps', async () => {
    let finish: () => void = () => undefined;
    const saveGate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const calls = mockApi({ status: 'DRAFT', saveGate });
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    useScheduleDrafts
      .getState()
      .keep(DRAFT_KEY, setCell(saved, EMP, '2026-09-05', TPL_DAY), saved, 1);
    admin();
    const button = await screen.findByRole('button', { name: `${s.save} (1)` });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(saves(calls)).toHaveLength(1));
    await act(async () => {
      finish();
      await saveGate;
    });
    expect(saves(calls)).toHaveLength(1);
  });

  it('does not dispatch when browser storage cannot preserve command identity', async () => {
    const calls = mockApi({ status: 'DRAFT' });
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
    useScheduleDrafts.getState().keep(DRAFT_KEY, local, saved, 1);
    admin();
    const button = await screen.findByRole('button', { name: `${s.save} (1)` });
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage full');
    });
    fireEvent.click(button);
    expect(await screen.findByText(t.commandStorageError)).toBeTruthy();
    expect(commands(calls)).toHaveLength(0);
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
    storage.mockRestore();
    fireEvent.click(button);
    await waitFor(() => expect(saves(calls)).toHaveLength(1));
  });

  it('lets a unit master prepare and submit a draft but never publish', async () => {
    const calls = mockApi({ status: 'PUBLISHED', created: true });
    render(
      <NavigationProvider
        actorId={ACTOR}
        go={() => undefined}
        roles={['SHIFT_MASTER']}
        grants={[{ role: 'SHIFT_MASTER', scopeType: 'ORG_UNIT', scopeId: UNIT }]}
      >
        <SchedulePage />
      </NavigationProvider>,
    );
    expect(await screen.findByText(t.draftState)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.add })).toBeTruthy();
    expect(await screen.findByRole('button', { name: s.submit })).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.reviewPublish })).toBeNull();
    expect(screen.queryByRole('button', { name: s.returnToDraft })).toBeNull();
    expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  });
  it('starts with the published zone overview and hides mutation controls for readers', async () => {
    const calls = mockApi({ status: 'PUBLISHED', created: true });
    render(
      <NavigationProvider
        actorId={ACTOR}
        go={() => undefined}
        roles={['HR']}
        grants={[{ role: 'HR', scopeType: 'ENTERPRISE', scopeId: null }]}
      >
        <SchedulePage />
      </NavigationProvider>,
    );
    expect(await screen.findByText(t.publishedState)).toBeTruthy();
    expect(screen.getByRole('radio', { name: t.zones }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('button', { name: t.add })).toBeNull();
    expect(screen.queryByRole('button', { name: t.create })).toBeNull();
    expect(screen.queryByRole('button', { name: t.reviewPublish })).toBeNull();
    expect(screen.queryByRole('button', { name: /^${t.add}:/ })).toBeNull();
    expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  });
  it('limits a zone master to creating and editing inside the granted zone', async () => {
    const OTHER_ZONE = 'a0000000-0000-4000-8000-000000000004';
    mockApi(
      { status: 'DRAFT' },
      {
        ...org,
        zones: [...org.zones, { ...org.zones[0]!, id: OTHER_ZONE, code: 'L2', name: 'Линия 2' }],
      },
    );
    render(
      <NavigationProvider
        actorId={ACTOR}
        go={() => undefined}
        roles={['SHIFT_MASTER']}
        grants={[{ role: 'SHIFT_MASTER', scopeType: 'ZONE', scopeId: OTHER_ZONE }]}
      >
        <SchedulePage />
      </NavigationProvider>,
    );
    await screen.findByText(t.draftState);
    await showWeekOf(/Кузнецов Леонид, 05/);
    expect(screen.queryByRole('button', { name: `${t.add}: Линия 1, 2026-09-06` })).toBeNull();
    expect(screen.getByRole('button', { name: `${t.add}: Линия 2, 2026-09-06` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Кузнецов Леонид, 05/ }));
    const sheet = await screen.findByRole('dialog');
    expect(
      within(sheet).getByRole('button', { name: t.editAssignment }).hasAttribute('disabled'),
    ).toBe(true);
    // The reason for the disabled actions lives in the information tip next to them.
    expect(
      within(sheet)
        .getByRole('group', { name: t.wholeAssignment })
        .querySelector('[data-info-tip]'),
    ).not.toBeNull();
  });
  it('retains selected assignment context when changing grouping and opens the existing editor', async () => {
    mockApi({ status: 'DRAFT' });
    admin();
    await screen.findByText(t.draftState);
    await showWeekOf(/Кузнецов Леонид, 05/);
    const calendar = screen.getByRole('table', { name: t.calendar });
    const rowCount = within(calendar).getAllByRole('row').length;
    const origin = screen.getByRole('button', { name: /Кузнецов Леонид, 05/ });
    fireEvent.click(origin);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(within(calendar).getAllByRole('row', { hidden: true })).toHaveLength(rowCount);
    fireEvent.click(
      screen.getByRole('button', { name: messages(currentLocale()).ui.common.close }),
    );
    await waitFor(() => expect(document.activeElement).toBe(origin));
    fireEvent.click(screen.getByRole('radio', { name: t.people }));
    // Closing the details drops the selection; the card is pressed only while the panel is open.
    const assignment = screen.getByRole('button', { name: /Линия 1, 05/ });
    expect(assignment.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(assignment);
    expect(assignment.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: t.wholeAssignment })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.editAssignment }));
    expect(screen.getByRole('combobox', { name: s.employee }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: t.apply }).hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByRole('button', { name: t.backToDetails })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: t.cancel })).toBeNull();
  });
  it('offers only supported mobile periods and keeps day navigation usable', async () => {
    viewport.mobile = true;
    mockApi({ status: 'PUBLISHED' });
    admin();
    await screen.findByText(t.publishedState);
    expect(screen.queryByRole('radio', { name: t.month })).toBeNull();
    expect(screen.getByRole('radio', { name: t.day }).getAttribute('aria-checked')).toBe('true');
    const navigation = [
      screen.getByRole('button', { name: t.previous }),
      screen.getByRole('button', { name: t.next }),
    ];
    expect(navigation.some((button) => !button.hasAttribute('disabled'))).toBe(true);
  });
  it('filters the monthly people projection without changing assignments in another zone', async () => {
    mockApi({ status: 'DRAFT' });
    admin();
    await screen.findByText(t.draftState);
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const next = setAssignment(saved, {
      employeeId: EMP,
      businessDate: '2026-09-06',
      templateId: TPL_DAY,
      zoneId: EMP2,
      kind: 'EXTRA',
    });
    act(() => useScheduleDrafts.getState().keep(DRAFT_KEY, next, saved, 1));
    fireEvent.click(screen.getByRole('radio', { name: t.month }));
    fireEvent.change(screen.getByRole('combobox', { name: t.zone }), { target: { value: ZONE } });
    expect(screen.getByRole('region', { name: t.people })).toBeTruthy();
    expect(
      new URL(
        screen.getByRole('link', { name: 'Кузнецов Леонид' }).getAttribute('href') ?? '',
        location.href,
      ).hash,
    ).toBe(`#/administration/employees/${EMP}`);
    expect(screen.getByText(t.outsideZone)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Кузнецов Леонид, 2026-09-06/ })).toBeNull();
    expect(gridToItems(useScheduleDrafts.getState().drafts[DRAFT_KEY] ?? { rows: [] })).toEqual(
      gridToItems(next),
    );
    fireEvent.click(screen.getByRole('button', { name: /Кузнецов Леонид, 2026-09-05/ }));
    fireEvent.click(screen.getByRole('button', { name: t.removeAssignment }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('region', { name: t.people })),
    );
    expect(gridToItems(useScheduleDrafts.getState().drafts[DRAFT_KEY] ?? { rows: [] })).toEqual(
      gridToItems(next).filter((item) => item.zoneId !== ZONE),
    );
  });
  it('opens the month as a day/night employee matrix with read-only assignment details', async () => {
    mockApi({ status: 'PUBLISHED' });
    render(
      <NavigationProvider
        actorId={ACTOR}
        go={() => undefined}
        roles={['HR']}
        grants={[{ role: 'HR', scopeType: 'ENTERPRISE', scopeId: null }]}
      >
        <SchedulePage />
      </NavigationProvider>,
    );
    await screen.findByText(t.publishedState);
    fireEvent.click(screen.getByRole('radio', { name: t.month }));
    expect(screen.queryByRole('radio', { name: t.zones })).toBeNull();
    expect(screen.getByRole('region', { name: t.people })).toBeTruthy();
    expect(
      new URL(
        screen.getByRole('link', { name: 'Кузнецов Леонид' }).getAttribute('href') ?? '',
        location.href,
      ).hash,
    ).toBe(`#/administration/employees/${EMP}`);
    expect(screen.queryByRole('button', { name: t.date })).toBeNull();
    const cell = await screen.findByRole('button', { name: /Кузнецов Леонид, 2026-09-05/ });
    expect(cell.textContent).toBe(messages(currentLocale()).schedule.dayKinds.NIGHT);
    fireEvent.click(cell);
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Линия 1')).toBeTruthy();
    expect(within(sheet).queryByRole('combobox')).toBeNull();
    expect(within(sheet).queryByRole('button', { name: t.apply })).toBeNull();
  });
  it('keeps month mode and its toolbar picker when the selected year changes', async () => {
    mockApi({ status: 'PUBLISHED' });
    admin();
    await screen.findByRole('radio', { name: t.zones });
    fireEvent.click(screen.getByRole('radio', { name: t.month }));
    fireEvent.click(
      screen.getByRole('button', { name: messages(currentLocale()).admin.schedule.month }),
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: messages(currentLocale()).ui.common.calendarYear }),
      { target: { value: '2027' } },
    );
    const january = new Intl.DateTimeFormat(currentLocale(), { month: 'short' }).format(
      new Date(2000, 0, 1),
    );
    fireEvent.click(screen.getByRole('button', { name: january }));
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: t.month }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    );
    expect(
      screen.getByRole('button', { name: messages(currentLocale()).admin.schedule.month })
        .textContent,
    ).toContain('2027');
    expect(screen.queryByRole('radio', { name: t.zones })).toBeNull();
  });
  it.each([false, true])(
    'links worker avatars and names to profiles (mobile: %s)',
    async (mobile) => {
      viewport.mobile = mobile;
      const calls = mockApi(
        { status: 'PUBLISHED' },
        org,
        employees.map((employee) => ({
          ...employee,
          avatarVersion: mobile ? null : ASSIGN,
        })),
      );
      writeSchedulePreset({
        actorId: ACTOR,
        orgUnitId: UNIT,
        month: '2026-09',
        people: [{ id: EMP2, name: 'Сидоров Пётр' }],
      });
      const mounted = admin();
      await screen.findByText(t.publishedState);
      fireEvent.click(screen.getByRole('radio', { name: t.people }));
      const link = await screen.findByRole('link', { name: 'Кузнецов Леонид' });
      expect(new URL(link.getAttribute('href') ?? '', location.href).hash).toBe(
        `#/administration/employees/${EMP}`,
      );
      if (mobile) expect(link.querySelector('svg')).toBeTruthy();
      else
        expect(link.querySelector('img')?.getAttribute('src')).toContain(
          `/admin/employees/${EMP}/avatar?v=${ASSIGN}`,
        );
      expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
      mounted.unmount();
      admin();
      expect(await screen.findByRole('link', { name: 'Кузнецов Леонид' })).toBeTruthy();
      expect(screen.getByRole('radio', { name: t.people }).getAttribute('aria-checked')).toBe(
        'true',
      );
      viewport.mobile = false;
    },
  );
  it('does not create a version automatically when arriving with overview workers', async () => {
    const calls = mockApi({ status: 'PUBLISHED' });
    writeSchedulePreset({
      actorId: ACTOR,
      orgUnitId: UNIT,
      month: '2026-09',
      people: [{ id: EMP2, name: 'Сидоров Пётр' }],
    });
    admin();
    expect(await screen.findByText(t.publishedState)).toBeTruthy();
    expect(screen.getByText(/Сидоров Пётр/)).toBeTruthy();
    expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  });
  it('preserves full-month assignments and metadata when saving an edited cell', async () => {
    const calls = mockApi({ status: 'DRAFT' });
    admin();
    await screen.findByText(t.draftState);
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const next = setAssignment(saved, {
      employeeId: EMP2,
      businessDate: '2026-09-25',
      templateId: TPL_DAY,
      zoneId: ZONE,
      kind: 'EXTRA',
      positionId: ZONE,
      teamId: ZONE,
    });
    act(() => useScheduleDrafts.getState().keep(DRAFT_KEY, next, saved, 1));
    fireEvent.click(screen.getByRole('button', { name: `${s.save} (1)` }));
    await waitFor(() => expect(saves(calls).length > 0).toBe(true));
    expect(saves(calls)[0]).toMatchObject({
      expectedRevision: 1,
      action: 'SAVE',
      versionId: VERSION,
      payload: { items: gridToItems(next) },
    });
    expect(gridToItems(next)).toHaveLength(2);
  });
  it('offers undo and redo, returning Save to disabled when the edit is undone', async () => {
    mockApi({ status: 'DRAFT' });
    admin();
    await screen.findByText(t.draftState);
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    act(() =>
      useScheduleDrafts
        .getState()
        .keep(DRAFT_KEY, setCell(saved, EMP, '2026-09-05', TPL_DAY), saved, 1),
    );
    fireEvent.click(screen.getByRole('button', { name: t.undo }));
    expect(screen.queryByRole('button', { name: `${s.save} (1)` })).toBeNull();
    expect(screen.getByRole('button', { name: t.reviewPublish })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.redo }));
    expect(screen.getByRole('button', { name: `${s.save} (1)` }).hasAttribute('disabled')).toBe(
      false,
    );
  });
  it('blocks stale local drafts and retains them for recovery', async () => {
    mockApi({ status: 'DRAFT' });
    const old = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
    const local = setCell(old, EMP, '2026-09-05', '');
    act(() =>
      useScheduleDrafts
        .getState()
        .keep(DRAFT_KEY, local, setCell(old, EMP, '2026-09-05', TPL_DAY), 1),
    );
    admin();
    expect(await screen.findByText(t.stale)).toBeTruthy();
    expect(screen.getByRole('button', { name: `${s.save} (1)` }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
  });
  it('shows concrete publication differences and sends the entered change reason', async () => {
    const calls = mockApi({ status: 'PUBLISHED' });
    admin();
    await screen.findByText(t.publishedState);
    const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('PUBLISHED')));
    const next = setCell(saved, EMP, '2026-09-05', TPL_DAY);
    act(() => useScheduleDrafts.getState().keep(DRAFT_KEY, next, saved, 1));
    fireEvent.click(screen.getByRole('button', { name: t.reviewPublish }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(new RegExp(t.nightShift))).toBeTruthy();
    expect(within(dialog).getByText(new RegExp(t.dayShift))).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(t.reason), {
      target: { value: 'Move to the day shift' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: s.publish }));
    await waitFor(() => expect(revisions(calls).length > 0).toBe(true));
    expect(revisions(calls)[0]).toMatchObject({
      expectedRevision: 1,
      payload: { items: gridToItems(next), changeReason: 'Move to the day shift' },
    });
  });
});

it('previews a batch before applying it and keeps it local until Save', async () => {
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  clearPersistentState();
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'DRAFT' });
  admin();
  fireEvent.click(await screen.findByRole('button', { name: t.add }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Сидоров Пётр' }));
  fireEvent.change(within(dialog).getByLabelText(t.zone), { target: { value: ZONE } });
  fireEvent.change(within(dialog).getByLabelText(t.template), { target: { value: TPL_DAY } });
  fireEvent.click(within(dialog).getByRole('button', { name: t.preview }));
  expect(within(dialog).getByText(`${t.added}: 1`)).toBeTruthy();
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole('button', { name: t.apply }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: `${s.save} (1)` }).hasAttribute('disabled')).toBe(
    false,
  );
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  cleanup();
  vi.unstubAllGlobals();
});

it('preserves unsaved edits when the server version is now in review and blocks publication', async () => {
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  clearPersistentState();
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'IN_REVIEW' });
  const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
  const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
  useScheduleDrafts.getState().keep(DRAFT_KEY, local, saved, 1);
  admin();
  expect(await screen.findByText(t.readOnlyChanges)).toBeTruthy();
  expect(screen.getByRole('button', { name: t.reviewPublish }).hasAttribute('disabled')).toBe(true);
  expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  cleanup();
  vi.unstubAllGlobals();
});

it('offers recovery for a no-op legacy draft after the version enters review', async () => {
  const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
  const legacy = {
    rows: saved.rows.map(({ employeeId, zoneId, cells }) => ({ employeeId, zoneId, cells })),
  };
  useScheduleDrafts.setState({
    drafts: { [DRAFT_KEY]: legacy },
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  clearPersistentState();
  setUiState({ 'schedule.month': '2026-09' });
  mockApi({ status: 'IN_REVIEW' });
  admin();
  expect(await screen.findByText(t.readOnlyChanges)).toBeTruthy();
  expect(screen.getByRole('button', { name: t.discard }).hasAttribute('disabled')).toBe(false);
  expect(screen.getByRole('button', { name: t.reviewPublish }).hasAttribute('disabled')).toBe(true);
  cleanup();
  vi.unstubAllGlobals();
});

it('finds a worker beyond 200 through the paginated batch picker without trimming hidden assignments', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const roster = Array.from({ length: 205 }, (_, index) => ({
    ...employees[0],
    id: `b0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    personnelNumber: `P${index}`,
    fullName: `Roster worker ${index + 1}`,
    status: 'ACTIVE',
    telegramLinked: false,
    currentPosition: null,
    email: null,
    phone: null,
    telegramUsername: null,
    createdAt: '2026-09-01T00:00:00Z',
  }));
  const calls = mockApi({ status: 'DRAFT' }, org, roster);
  admin();
  fireEvent.click(await screen.findByRole('button', { name: t.add }));
  const dialog = screen.getByRole('dialog');
  await waitFor(() => expect(within(dialog).getAllByRole('checkbox')).toHaveLength(20));
  fireEvent.click(within(dialog).getByRole('button', { name: t.allPeople }));
  expect(within(dialog).getByText(`${t.selectedPeople}: 20`)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: t.clearPeople }));
  fireEvent.change(within(dialog).getByRole('searchbox', { name: t.workerSearch }), {
    target: { value: 'Roster worker 205' },
  });
  fireEvent.click(await within(dialog).findByRole('checkbox', { name: 'Roster worker 205' }));
  fireEvent.change(within(dialog).getByLabelText(t.zone), { target: { value: ZONE } });
  fireEvent.change(within(dialog).getByLabelText(t.template), { target: { value: TPL_DAY } });
  fireEvent.click(within(dialog).getByRole('button', { name: t.preview }));
  fireEvent.click(within(dialog).getByRole('button', { name: t.apply }));
  fireEvent.click(screen.getByRole('button', { name: `${s.save} (1)` }));
  await waitFor(() => expect(saves(calls).length > 0).toBe(true));
  expect(saves(calls)[0]?.payload).toMatchObject({
    items: expect.arrayContaining([
      expect.objectContaining({
        employeeId: EMP,
        businessDate: '2026-09-05',
        templateId: TPL_NIGHT,
      }),
      expect.objectContaining({ employeeId: roster[204]?.id, templateId: TPL_DAY }),
    ]),
  });
  cleanup();
  vi.unstubAllGlobals();
});

it('retains a stale draft and its original revision after the server rejects a save', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'DRAFT', conflict: true });
  admin();
  await screen.findByText(t.draftState);
  const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
  const local = setCell(saved, EMP, '2026-09-05', TPL_DAY);
  act(() => useScheduleDrafts.getState().keep(DRAFT_KEY, local, saved, 1));
  fireEvent.click(screen.getByRole('button', { name: `${s.save} (1)` }));
  await waitFor(() => expect(screen.getAllByText(t.stale).length).toBeGreaterThan(0));
  expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toEqual(local);
  expect(useScheduleDrafts.getState().revisions[DRAFT_KEY]).toBe(1);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: `${s.save} (1)` }).hasAttribute('disabled')).toBe(
      true,
    ),
  );
  expect(saves(calls)).toHaveLength(1);
  expect(saves(calls)[0]).toMatchObject({ expectedRevision: 1 });
  fireEvent.click(screen.getByRole('button', { name: t.discard }));
  const confirmation = await screen.findByRole('alertdialog');
  fireEvent.click(within(confirmation).getByRole('button', { name: t.discard }));
  await waitFor(() => expect(screen.queryByText(t.stale)).toBeNull());
  expect(useScheduleDrafts.getState().drafts[DRAFT_KEY]).toBeUndefined();

  cleanup();
  vi.unstubAllGlobals();
});

it('disables lifecycle actions when an identical server grid has a newer revision', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const saved = gridFromDetail(ScheduleVersionDetail.parse(detail('DRAFT')));
  useScheduleDrafts
    .getState()
    .keep(DRAFT_KEY, setCell(saved, EMP, '2026-09-05', TPL_DAY), saved, 1);
  useScheduleDrafts.getState().undo(DRAFT_KEY);
  const calls = mockApi({ status: 'DRAFT', revision: 2 });
  admin();
  expect(await screen.findByText(t.stale)).toBeTruthy();
  expect(screen.getByRole('button', { name: t.reviewPublish }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('menuitem', { name: t.deleteDraft }).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByRole('button', { name: t.add })).toBeNull();
  expect(useScheduleDrafts.getState().revisions[DRAFT_KEY]).toBe(1);
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  cleanup();
  vi.unstubAllGlobals();
});

it('keeps a legacy API schedule readable but disables editing during a rolling deployment', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'DRAFT', legacyApi: true });
  admin();
  expect(await screen.findByText(t.revisionUnavailable)).toBeTruthy();
  expect(screen.queryByRole('button', { name: t.add })).toBeNull();
  expect(screen.getByRole('button', { name: t.reviewPublish }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: t.month }));
  expect((await screen.findAllByText('Кузнецов Леонид')).length).toBeGreaterThan(0);
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  cleanup();
  vi.unstubAllGlobals();
});

it('retains command identity without falling back when an older API has no command endpoint', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'EMPTY', legacyApi: true });
  admin();
  fireEvent.click(await screen.findByRole('button', { name: t.create }));
  expect(await screen.findByText(t.commandUnconfirmed)).toBeTruthy();
  expect(screen.getByRole('button', { name: t.create }).hasAttribute('disabled')).toBe(true);
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  expect(calls.some((call) => call.path === '/admin/schedules' && call.method === 'POST')).toBe(
    false,
  );
  cleanup();
  vi.unstubAllGlobals();
});

it("starts a draft copy on a planner's first edit of a published month and keeps the edit", async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'PUBLISHED' });
  render(
    <NavigationProvider
      actorId={ACTOR}
      go={() => undefined}
      roles={['PLANNER']}
      grants={[{ role: 'PLANNER', scopeType: 'ORG_UNIT', scopeId: UNIT }]}
    >
      <SchedulePage />
    </NavigationProvider>,
  );
  await screen.findByText(t.publishedState);
  expect(screen.queryByRole('button', { name: t.reviewPublish })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: t.add }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Сидоров Пётр' }));
  fireEvent.change(within(dialog).getByLabelText(t.zone), { target: { value: ZONE } });
  fireEvent.change(within(dialog).getByLabelText(t.template), { target: { value: TPL_DAY } });
  fireEvent.click(within(dialog).getByRole('button', { name: t.preview }));
  fireEvent.click(within(dialog).getByRole('button', { name: t.apply }));
  await waitFor(() => expect(commands(calls)).toHaveLength(1));
  expect(commands(calls)[0]).toMatchObject({
    action: 'CREATE',
    payload: { basedOnVersionId: VERSION },
  });
  expect(await screen.findByText(t.draftState)).toBeTruthy();
  const draftKey = scheduleDraftKey(
    ACTOR,
    SITE,
    UNIT,
    '2026-09',
    'd0000000-0000-4000-8000-000000000002',
  );
  await waitFor(() =>
    expect(gridToItems(useScheduleDrafts.getState().drafts[draftKey] ?? { rows: [] })).toHaveLength(
      2,
    ),
  );
  expect(await screen.findByRole('button', { name: `${s.save} (1)` })).toBeTruthy();
  expect(screen.queryByText(t.stale)).toBeNull();
  cleanup();
  vi.unstubAllGlobals();
});

it('publishes a saved draft by submitting and then publishing with the entered reason', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'DRAFT' });
  admin();
  const review = await screen.findByRole('button', { name: t.reviewPublish });
  await waitFor(() => expect(review.hasAttribute('disabled')).toBe(false));
  fireEvent.click(review);
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(t.publishFirstHint)).toBeTruthy();
  fireEvent.change(within(dialog).getByLabelText(t.reason), {
    target: { value: 'First plan of the month' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: s.publish }));
  await waitFor(() =>
    expect(commands(calls).map((command) => command.action)).toEqual(['SUBMIT', 'PUBLISH']),
  );
  expect(commands(calls)[1]).toMatchObject({
    action: 'PUBLISH',
    versionId: VERSION,
    expectedRevision: 1,
    payload: { changeReason: 'First plan of the month' },
  });
  expect(await within(dialog).findByText(t.success)).toBeTruthy();
  cleanup();
  vi.unstubAllGlobals();
});

it('shows the draft as the working plan and lets a reader switch to the published month', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'PUBLISHED', created: true });
  admin();
  expect(await screen.findByText(t.draftState)).toBeTruthy();
  expect(screen.queryByText(/v[12]\b/)).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: t.showPublished }));
  expect(await screen.findByText(t.publishedState)).toBeTruthy();
  expect(screen.getByText(t.viewingPublished)).toBeTruthy();
  expect(screen.queryByRole('button', { name: t.add })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: t.showDraft }));
  expect(await screen.findByText(t.draftState)).toBeTruthy();
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  cleanup();
  vi.unstubAllGlobals();
});

it('navigates past the month end, loads the next month and keeps the previous month read only', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const september = ScheduleVersionDetail.parse(detail('PUBLISHED'));
  const original = september.assignments[0];
  if (!original) throw new Error('Missing assignment fixture');
  september.assignments = [
    original,
    { ...original, id: EMP2, businessDate: '2026-09-30', templateId: TPL_DAY, templateCode: 'DAY' },
  ];
  const OCTOBER = 'd0000000-0000-4000-8000-000000000003';
  const october = ScheduleVersionDetail.parse({
    version: { ...version('PUBLISHED'), id: OCTOBER, periodMonth: '2026-10' },
    assignments: [
      {
        ...original,
        id: ZONE,
        scheduleVersionId: OCTOBER,
        employeeId: EMP2,
        businessDate: '2026-10-01',
        planStartAt: '2026-10-01T17:00:00.000Z',
        planEndAt: '2026-10-02T05:00:00.000Z',
      },
    ],
  });
  const calls = mockApi({ status: 'PUBLISHED', savedDetail: september, october });
  admin();
  await screen.findByText(t.publishedState);
  const next = screen.getByRole('button', { name: t.next });
  expect(next.hasAttribute('disabled')).toBe(false);
  fireEvent.click(next);
  fireEvent.click(next);
  fireEvent.click(next);
  // The selected date is now 4 October: October becomes the loaded month, September stays visible.
  await waitFor(() =>
    expect(calls.some((call) => call.path.includes('periodMonth=2026-10'))).toBe(true),
  );
  const septemberCard = await screen.findByRole('button', { name: /Кузнецов Леонид, 30\.09/ });
  expect(septemberCard.className).toContain('opacity-70');
  expect(await screen.findByRole('button', { name: /Сидоров Пётр, 01\.10/ })).toBeTruthy();
  const reason = t.otherMonth.split('{month}')[0] ?? '';
  expect(screen.getAllByText(new RegExp(reason.trim())).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: `${t.add}: Линия 1, 2026-09-29` })).toBeNull();
  expect(screen.getByRole('button', { name: `${t.add}: Линия 1, 2026-10-02` })).toBeTruthy();
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  cleanup();
  vi.unstubAllGlobals();
});

it('shows staffing shortage from requirements and blocks an unqualified assignment', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const QUALIFICATION = 'e1000000-0000-4000-8000-000000000001';
  mockApi({
    status: 'DRAFT',
    staffing: {
      qualifications: [
        { id: QUALIFICATION, siteId: SITE, code: 'OP', name: 'Line operator', isActive: true },
      ],
      requirements: [
        {
          id: 'e2000000-0000-4000-8000-000000000001',
          zoneId: ZONE,
          templateId: TPL_NIGHT,
          requiredCount: 2,
          qualificationId: QUALIFICATION,
          effectiveFrom: '2026-09-01',
          effectiveTo: null,
          note: null,
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      holdings: [
        {
          id: 'e3000000-0000-4000-8000-000000000001',
          employeeId: EMP,
          qualificationId: QUALIFICATION,
          validFrom: '2026-01-01',
          validUntil: null,
          note: null,
          recordedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    },
  });
  admin();
  await screen.findByText(t.draftState);
  await showWeekOf(/Кузнецов Леонид, 05/);
  // The qualified holder covers one of two required night operators on 5 September.
  expect(await screen.findByText(t.coverageShort.replace('{count}', '11'))).toBeTruthy();
  expect(screen.getByText(`${messages(currentLocale()).schedule.dayKinds.NIGHT} 1/2`)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: `${t.add}: Линия 1, 2026-09-05` }));
  const sheet = await screen.findByRole('dialog');
  fireEvent.change(within(sheet).getByRole('combobox', { name: s.employee }), {
    target: { value: EMP2 },
  });
  fireEvent.change(within(sheet).getByLabelText(t.template), { target: { value: TPL_NIGHT } });
  expect(within(sheet).getByText(/Line operator/)).toBeTruthy();
  expect(within(sheet).getByRole('button', { name: t.apply }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(within(sheet).getByLabelText(t.template), { target: { value: TPL_DAY } });
  expect(within(sheet).queryByText(/Line operator/)).toBeNull();
  expect(within(sheet).getByRole('button', { name: t.apply }).hasAttribute('disabled')).toBe(false);
  cleanup();
  vi.unstubAllGlobals();
});

it('keeps Apply disabled with a retry while the plan context is unavailable', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const state = { status: 'DRAFT', contextFail: true };
  mockApi(state);
  admin();
  await screen.findByText(t.draftState);
  await showWeekOf(/Кузнецов Леонид, 05/);
  fireEvent.click(screen.getByRole('button', { name: `${t.add}: Линия 1, 2026-09-05` }));
  const sheet = await screen.findByRole('dialog');
  fireEvent.change(within(sheet).getByRole('combobox', { name: s.employee }), {
    target: { value: EMP2 },
  });
  fireEvent.change(within(sheet).getByLabelText(t.template), { target: { value: TPL_DAY } });
  const apply = () => within(sheet).getByRole('button', { name: t.apply });
  expect(await within(sheet).findByText(t.contextUnavailable)).toBeTruthy();
  expect(apply().hasAttribute('disabled')).toBe(true);
  state.contextFail = false;
  fireEvent.click(
    within(sheet).getByRole('button', { name: messages(currentLocale()).ui.common.retry }),
  );
  await waitFor(() => expect(apply().hasAttribute('disabled')).toBe(false));
  cleanup();
  vi.unstubAllGlobals();
});

it('lets an administrator add a staffing requirement from the staffing sheet', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const calls = mockApi({ status: 'PUBLISHED' });
  admin();
  await screen.findByText(t.publishedState);
  fireEvent.click(screen.getByRole('menuitem', { name: t.staffing }));
  const sheet = await screen.findByRole('dialog');
  const add = await within(sheet).findByRole('button', { name: t.addRequirement });
  await waitFor(() => expect(add.hasAttribute('disabled')).toBe(false));
  fireEvent.change(within(sheet).getByLabelText(t.requiredCount), { target: { value: '3' } });
  fireEvent.click(add);
  await waitFor(() =>
    expect(
      calls.some((call) => call.method === 'PUT' && call.path.endsWith('/staffing/requirements')),
    ).toBe(true),
  );
  expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({
    zoneId: ZONE,
    templateId: TPL_DAY,
    requiredCount: 3,
    qualificationId: null,
    effectiveFrom: '2026-09-01',
  });
  cleanup();
  vi.unstubAllGlobals();
});

it('marks a cross-unit overlap as a blocking conflict, explains it and disables saving', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const OTHER_UNIT = 'a0000000-0000-4000-8000-000000000012';
  mockApi({
    status: 'DRAFT',
    context: {
      intervals: [
        {
          employeeId: EMP,
          businessDate: '2026-09-05',
          startAt: '2026-09-05T18:00:00.000Z',
          endAt: '2026-09-06T02:00:00.000Z',
          orgUnitId: OTHER_UNIT,
          status: 'PUBLISHED',
        },
      ],
      absences: [
        {
          employeeId: EMP2,
          from: '2026-09-07',
          to: '2026-09-08',
          type: 'VACATION',
          status: 'PENDING',
        },
      ],
      otherUnitEmployees: [],
    },
  });
  admin();
  await screen.findByText(t.draftState);
  expect(await screen.findByText(t.conflictsCount.replace('{count}', '1'))).toBeTruthy();
  await showWeekOf(/Кузнецов Леонид, 05/);
  const card = screen.getByRole('button', { name: /Кузнецов Леонид, 05/ });
  expect(card.getAttribute('aria-label')).toContain(t.conflict);
  fireEvent.click(card);
  const sheet = await screen.findByRole('dialog');
  expect(within(sheet).getByText(/2026-09-05/)).toBeTruthy();
  expect(within(sheet).getByRole('list', { name: t.conflict }).textContent).toContain('2026-09-05');
  fireEvent.click(within(sheet).getByRole('button', { name: t.editAssignment }));
  fireEvent.change(within(sheet).getByLabelText(t.template), { target: { value: TPL_DAY } });
  // Moving to the day shift removes the overlap with the other unit's evening shift.
  expect(within(sheet).getByRole('button', { name: t.apply }).hasAttribute('disabled')).toBe(false);
  fireEvent.click(within(sheet).getByRole('button', { name: t.apply }));
  await waitFor(() =>
    expect(screen.queryByText(t.conflictsCount.replace('{count}', '1'))).toBeNull(),
  );
  expect(screen.getByRole('button', { name: `${s.save} (1)` }).hasAttribute('disabled')).toBe(
    false,
  );
  cleanup();
  vi.unstubAllGlobals();
});

it('lists candidates with reasons when creating a shift and blocks an absent worker', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  mockApi({
    status: 'DRAFT',
    candidates: [
      { employeeId: EMP2, orgUnitId: UNIT, ownUnit: true, status: 'ELIGIBLE', reasons: [] },
      {
        employeeId: EMP,
        orgUnitId: UNIT,
        ownUnit: true,
        status: 'BLOCKED',
        reasons: [
          {
            code: 'ABSENCE',
            severity: 'BLOCK',
            employeeId: EMP,
            businessDate: '2026-09-06',
            detail: { type: 'VACATION', from: '2026-09-06', to: '2026-09-06' },
          },
        ],
      },
    ],
  });
  admin();
  await screen.findByText(t.draftState);
  await showWeekOf(/Кузнецов Леонид, 05/);
  fireEvent.click(screen.getByRole('button', { name: `${t.add}: Линия 1, 2026-09-06` }));
  const sheet = await screen.findByRole('dialog');
  fireEvent.change(within(sheet).getByLabelText(t.template), { target: { value: TPL_DAY } });
  const list = await within(sheet).findByRole('list');
  const blocked = within(list).getByRole('button', { name: /Кузнецов Леонид/ });
  expect(blocked.hasAttribute('disabled')).toBe(true);
  expect(blocked.textContent).toContain('VACATION');
  fireEvent.click(within(list).getByRole('button', { name: /Сидоров Пётр/ }));
  expect(within(sheet).getByRole('button', { name: t.apply }).hasAttribute('disabled')).toBe(false);
  cleanup();
  vi.unstubAllGlobals();
});

function freshState() {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
}

it('moves a shift by drag to another date and refuses an occupied target without changing the plan', async () => {
  freshState();
  mockApi({ status: 'DRAFT' });
  admin();
  await screen.findByText(t.draftState);
  await showWeekOf(/Кузнецов Леонид, 05/);
  const card = screen.getByRole('button', { name: /Кузнецов Леонид, 05/ });
  expect(card.getAttribute('draggable')).toBe('true');
  fireEvent.dragStart(card);
  const target = screen.getByRole('button', {
    name: `${t.add}: Линия 1, 2026-09-06`,
  }).parentElement;
  if (!target) throw new Error('Missing target cell');
  fireEvent.dragOver(target);
  fireEvent.drop(target);
  expect(await screen.findByRole('button', { name: /Кузнецов Леонид, 06/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Кузнецов Леонид, 05/ })).toBeNull();
  expect(gridToItems(useScheduleDrafts.getState().drafts[DRAFT_KEY] ?? { rows: [] })).toEqual([
    expect.objectContaining({ employeeId: EMP, businessDate: '2026-09-06', zoneId: ZONE }),
  ]);
  // Dropping onto a date the person already has keeps the plan and explains why.
  fireEvent.click(screen.getByRole('radio', { name: t.people }));
  const moved = screen.getByRole('button', { name: /Линия 1, 06/ });
  fireEvent.dragStart(moved);
  const same = moved.parentElement;
  if (!same) throw new Error('Missing cell');
  fireEvent.drop(same);
  expect(screen.queryByText(t.moveInvalidOccupied)).toBeNull();
  expect(gridToItems(useScheduleDrafts.getState().drafts[DRAFT_KEY] ?? { rows: [] })).toHaveLength(
    1,
  );
  cleanup();
  vi.unstubAllGlobals();
});

it('opens the explicit Move editor with the person changeable and the same validation', async () => {
  freshState();
  mockApi({ status: 'DRAFT' });
  admin();
  await screen.findByText(t.draftState);
  await showWeekOf(/Кузнецов Леонид, 05/);
  fireEvent.click(screen.getByRole('button', { name: /Кузнецов Леонид, 05/ }));
  const sheet = await screen.findByRole('dialog');
  fireEvent.click(within(sheet).getByRole('button', { name: t.moveAssignment }));
  const employee = within(sheet).getByRole('combobox', { name: s.employee });
  expect(employee.hasAttribute('disabled')).toBe(false);
  fireEvent.change(employee, { target: { value: EMP2 } });
  fireEvent.click(within(sheet).getByRole('button', { name: t.apply }));
  await waitFor(() =>
    expect(gridToItems(useScheduleDrafts.getState().drafts[DRAFT_KEY] ?? { rows: [] })).toEqual([
      expect.objectContaining({
        employeeId: EMP2,
        businessDate: '2026-09-05',
        templateId: TPL_NIGHT,
      }),
    ]),
  );
  cleanup();
  vi.unstubAllGlobals();
});

it('copies the previous week onto the visible week with a preview and no publication', async () => {
  freshState();
  const calls = mockApi({ status: 'DRAFT' });
  admin();
  await screen.findByText(t.draftState);
  // The visible week is 7–13 September; the previous week holds the 5 September shift.
  fireEvent.click(screen.getByRole('menuitem', { name: t.copyPeriod }));
  const dialog = await screen.findByRole('dialog');
  const preview = within(dialog).getByRole('button', { name: t.preview });
  await waitFor(() => expect(preview.hasAttribute('disabled')).toBe(false));
  fireEvent.click(preview);
  expect(within(dialog).getByText(`${t.added}: 1`)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: t.apply }));
  await waitFor(() =>
    expect(gridToItems(useScheduleDrafts.getState().drafts[DRAFT_KEY] ?? { rows: [] })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ employeeId: EMP, businessDate: '2026-09-05' }),
        expect.objectContaining({
          employeeId: EMP,
          businessDate: '2026-09-12',
          templateId: TPL_NIGHT,
          zoneId: ZONE,
        }),
      ]),
    ),
  );
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  cleanup();
  vi.unstubAllGlobals();
});

it('loads a saved pattern into the batch planner and saves the current input as a pattern', async () => {
  freshState();
  const calls = mockApi({
    status: 'DRAFT',
    patterns: [
      {
        id: 'e5000000-0000-4000-8000-000000000001',
        siteId: SITE,
        name: 'Two on two off',
        definition: { pattern: 'DAY_2_2', templateId: null, mode: 'replace', zoneId: ZONE },
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  });
  admin();
  fireEvent.click(await screen.findByRole('button', { name: t.add }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(await within(dialog).findByLabelText(t.loadPattern), {
    target: { value: 'e5000000-0000-4000-8000-000000000001' },
  });
  expect((within(dialog).getByLabelText(t.pattern) as HTMLSelectElement).value).toBe('DAY_2_2');
  expect((within(dialog).getByLabelText(t.batchMode) as HTMLSelectElement).value).toBe('replace');
  fireEvent.change(within(dialog).getByLabelText(t.batchMode), { target: { value: 'fill' } });
  fireEvent.click(within(dialog).getByRole('button', { name: t.savePattern }));
  const confirmation = await screen.findByRole('alertdialog');
  fireEvent.change(within(confirmation).getByRole('textbox'), { target: { value: 'Fill 2/2' } });
  fireEvent.click(within(confirmation).getByRole('button', { name: t.savePattern }));
  await waitFor(() =>
    expect(
      calls.some((call) => call.method === 'POST' && call.path === '/admin/schedules/patterns'),
    ).toBe(true),
  );
  expect(
    calls.find((call) => call.path === '/admin/schedules/patterns' && call.method === 'POST')?.body,
  ).toMatchObject({
    siteId: SITE,
    name: 'Fill 2/2',
    definition: { pattern: 'DAY_2_2', mode: 'fill', zoneId: ZONE },
  });
  cleanup();
  vi.unstubAllGlobals();
});

it('edits custom hours and zone segments locally and refuses a tiling that leaves a gap', async () => {
  freshState();
  mockApi({ status: 'DRAFT' });
  admin();
  await screen.findByText(t.draftState);
  await showWeekOf(/Кузнецов Леонид, 05/);
  fireEvent.click(screen.getByRole('button', { name: /Кузнецов Леонид, 05/ }));
  const sheet = await screen.findByRole('dialog');
  fireEvent.click(within(sheet).getByRole('button', { name: t.editAssignment }));
  const apply = () => within(sheet).getByRole('button', { name: t.apply });
  expect(apply().hasAttribute('disabled')).toBe(true);
  fireEvent.click(within(sheet).getByRole('checkbox', { name: t.customTime }));
  const start = within(sheet).getByLabelText(t.customStart);
  const end = within(sheet).getByLabelText(t.customEnd);
  expect((start as HTMLInputElement).value).toBe('20:00');
  fireEvent.change(start, { target: { value: '22:00' } });
  fireEvent.change(end, { target: { value: '06:00' } });
  expect(apply().hasAttribute('disabled')).toBe(false);
  fireEvent.click(within(sheet).getByRole('button', { name: t.addSegment }));
  const segments = within(sheet).getByRole('region', { name: t.segments });
  expect(within(segments).queryByText(t.segmentInvalid)).toBeNull();
  fireEvent.change(within(segments).getByLabelText(t.customEnd), { target: { value: '02:00' } });
  expect(within(segments).getByText(t.segmentInvalid)).toBeTruthy();
  expect(apply().hasAttribute('disabled')).toBe(true);
  fireEvent.click(within(sheet).getByRole('button', { name: t.addSegment }));
  expect(within(segments).queryByText(t.segmentInvalid)).toBeNull();
  expect(apply().hasAttribute('disabled')).toBe(false);
  fireEvent.click(apply());
  await waitFor(() =>
    expect(gridToItems(useScheduleDrafts.getState().drafts[DRAFT_KEY] ?? { rows: [] })).toEqual([
      expect.objectContaining({
        employeeId: EMP,
        businessDate: '2026-09-05',
        customStart: '22:00',
        customEnd: '06:00',
        segments: [
          { zoneId: ZONE, localStart: '22:00', localEnd: '02:00' },
          { zoneId: ZONE, localStart: '02:00', localEnd: '06:00' },
        ],
      }),
    ]),
  );
  const card = await screen.findByRole('button', { name: /Кузнецов Леонид, 05/ });
  expect(card.textContent).toContain('22:00');
  expect(card.textContent).toContain('02:00');
  expect(screen.getByRole('button', { name: `${s.save} (1)` }).hasAttribute('disabled')).toBe(
    false,
  );
  cleanup();
  vi.unstubAllGlobals();
});

it('plans a break with relief from the same date, refuses one outside the shift and shows workload', async () => {
  freshState();
  mockApi({
    status: 'DRAFT',
    savedDetail: ScheduleVersionDetail.parse({
      ...detail('DRAFT'),
      assignments: [
        detail('DRAFT').assignments[0]!,
        {
          ...detail('DRAFT').assignments[0]!,
          id: 'a0000000-0000-4000-8000-0000000000aa',
          employeeId: EMP2,
        },
      ],
    }),
  });
  admin();
  await screen.findByText(t.draftState);
  await showWeekOf(/Кузнецов Леонид, 05/);
  fireEvent.click(screen.getByRole('button', { name: /Кузнецов Леонид, 05/ }));
  const sheet = await screen.findByRole('dialog');
  fireEvent.click(within(sheet).getByRole('button', { name: t.editAssignment }));
  const apply = () => within(sheet).getByRole('button', { name: t.apply });
  fireEvent.click(within(sheet).getByRole('button', { name: t.addBreak }));
  const pauses = within(sheet).getByRole('region', { name: t.breaks });
  // A zero-length break is a whole day for the instant planner and leaves the shift.
  expect(within(pauses).getByText(t.breakInvalid)).toBeTruthy();
  expect(apply().hasAttribute('disabled')).toBe(true);
  fireEvent.change(within(pauses).getByLabelText(t.customEnd), { target: { value: '20:30' } });
  expect(within(pauses).queryByText(t.breakInvalid)).toBeNull();
  fireEvent.change(within(pauses).getByLabelText(t.relief), { target: { value: EMP2 } });
  expect(apply().hasAttribute('disabled')).toBe(false);
  fireEvent.click(apply());
  await waitFor(() =>
    expect(gridToItems(useScheduleDrafts.getState().drafts[DRAFT_KEY] ?? { rows: [] })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeId: EMP,
          breaks: [{ localStart: '20:00', localEnd: '20:30', reliefEmployeeId: EMP2 }],
        }),
      ]),
    ),
  );
  const card = await screen.findByRole('button', { name: /Кузнецов Леонид, 05/ });
  expect(card.textContent).toContain(
    t.breakPart.replace('{start}', '20:00').replace('{end}', '20:30'),
  );
  expect(card.textContent).toContain('Сидоров');
  fireEvent.click(screen.getByRole('menuitem', { name: t.workload }));
  const workload = await screen.findByRole('dialog', { name: t.workload });
  fireEvent.change(within(workload).getByLabelText(t.period), { target: { value: 'month' } });
  const row = within(workload).getByRole('row', { name: /Кузнецов Леонид/ });
  expect(row.textContent).toContain('11 ч 30 мин');
  expect(row.textContent).toContain('30 мин');
  expect(within(workload).getByText(t.workloadPlannedOnly)).toBeTruthy();
  cleanup();
  vi.unstubAllGlobals();
});

it('creates an internal open slot, offers it, lists responses and selects one person into the draft', async () => {
  freshState();
  const calls = mockApi({ status: 'DRAFT' });
  admin();
  await screen.findByText(t.draftState);
  await showWeekOf(/Кузнецов Леонид, 05/);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.add}: .*2026-09-06`) }));
  const sheet = await screen.findByRole('dialog');
  fireEvent.change(within(sheet).getByLabelText(t.template), { target: { value: TPL_DAY } });
  fireEvent.click(within(sheet).getByRole('button', { name: t.createOpenSlot }));
  await waitFor(() =>
    expect(
      calls.some((call) => call.method === 'POST' && call.path === '/admin/schedules/open-slots'),
    ).toBe(true),
  );
  expect(
    calls.find((call) => call.method === 'POST' && call.path === '/admin/schedules/open-slots')
      ?.body,
  ).toMatchObject({
    businessDate: '2026-09-06',
    templateId: TPL_DAY,
    zoneId: ZONE,
  });
  const card = await screen.findByRole('button', { name: new RegExp(`${t.openSlot}, 06`) });
  expect(card.textContent).toContain(t.slotInternal);
  expect(screen.getByText(t.openSlotsCount.replace('{count}', '1'))).toBeTruthy();
  // The slot is no assignment: nothing to save.
  expect(
    screen.queryByRole('button', { name: /^Сохранить/ })?.hasAttribute('disabled') ?? true,
  ).toBe(true);
  fireEvent.click(card);
  const details = await screen.findByRole('dialog');
  fireEvent.click(within(details).getByRole('button', { name: t.offerSlot }));
  await waitFor(() =>
    expect(calls.some((call) => call.path.endsWith('/offer') && call.method === 'POST')).toBe(true),
  );
  const responses = await within(details).findByRole('region', { name: t.responses });
  expect(responses.textContent).toContain('Сидоров');
  fireEvent.click(within(responses).getByRole('button', { name: t.selectCandidate }));
  await waitFor(() =>
    expect(
      calls.find((call) => call.path.endsWith('/select') && call.method === 'POST')?.body,
    ).toMatchObject({
      employeeId: EMP2,
      versionId: VERSION,
      expectedRevision: 1,
    }),
  );
  cleanup();
  vi.unstubAllGlobals();
});

it('overlays presence evidence and request context on a published shift and opens replacement candidates', async () => {
  freshState();
  setUiState({ 'schedule.month': '2026-09' });
  mockApi({
    status: 'PUBLISHED',
    operations: {
      fetchedAt: '2026-09-05T18:30:00.000Z',
      presence: [
        {
          assignmentId: ASSIGN,
          employeeId: EMP,
          businessDate: '2026-09-05',
          state: 'STARTED',
          acknowledgedAt: '2026-09-01T10:00:00.000Z',
          arrivedAt: '2026-09-05T16:55:00.000Z',
          startedAt: '2026-09-05T17:02:00.000Z',
          endedAt: null,
          sessionState: 'WORKING',
          sessionId: 'c7000000-0000-4000-8000-000000000001',
        },
      ],
      requests: [
        {
          id: 'a7000000-0000-4000-8000-000000000001',
          type: 'SWAP',
          status: 'IN_REVIEW',
          employeeId: EMP,
          counterpartEmployeeId: EMP2,
          periodFrom: null,
          periodTo: null,
          assignmentId: ASSIGN,
          assignmentDate: '2026-09-05',
          currentStep: 1,
          currentStepKey: 'MASTER',
          totalSteps: 2,
          submittedAt: '2026-09-04T10:00:00.000Z',
        },
      ],
    },
    candidates: [
      { employeeId: EMP2, orgUnitId: UNIT, ownUnit: true, status: 'ELIGIBLE', reasons: [] },
    ],
  });
  const go = vi.fn();
  admin(go);
  await screen.findByText(t.publishedState);
  await showWeekOf(/Кузнецов Леонид, 05/);
  const card = await screen.findByRole('button', { name: /Кузнецов Леонид, 05/ });
  await waitFor(() => expect(card.getAttribute('aria-label')).toContain('20:02'));
  fireEvent.click(card);
  const sheet = await screen.findByRole('dialog');
  expect(within(sheet).getByText(/20:02/)).toBeTruthy();
  const requestsSection = within(sheet).getByRole('region', { name: t.requestsContext });
  expect(requestsSection.textContent).toContain('MASTER');
  expect(requestsSection.textContent).toContain('Сидоров');
  fireEvent.click(within(requestsSection).getByRole('button', { name: t.openRequests }));
  expect(go).toHaveBeenCalledWith('requests');
  // A related request opens its own record; the shift record opens on the Operations screen
  // standing on that day with every shift visible, so the row is there to be highlighted.
  fireEvent.click(within(requestsSection).getByRole('button', { name: /MASTER/ }));
  expect(go).toHaveBeenLastCalledWith('requests', 'a7000000-0000-4000-8000-000000000001');
  expect(uiState('requests.scope')).toBe('all');
  fireEvent.click(within(sheet).getByRole('button', { name: t.openShiftRecord }));
  expect(go).toHaveBeenLastCalledWith('operations', 'c7000000-0000-4000-8000-000000000001');
  expect(uiState('operations.day')).toBe('2026-09-05');
  expect(uiState('operations.scope')).toBe('ALL');
  expect(uiState('operations.siteId')).toBe(SITE);
  fireEvent.click(within(sheet).getByRole('button', { name: t.findReplacement }));
  const candidates = await within(sheet).findByRole('region', { name: t.candidates });
  expect(await within(candidates).findByText('Сидоров Пётр')).toBeTruthy();
  expect(within(candidates).queryByText('Кузнецов Леонид')).toBeNull();
  cleanup();
  vi.unstubAllGlobals();
});

it('adds a note with an explicit audience to the selected shift and lists it', async () => {
  freshState();
  const calls = mockApi({ status: 'DRAFT' });
  admin();
  await screen.findByText(t.draftState);
  await showWeekOf(/Кузнецов Леонид, 05/);
  fireEvent.click(screen.getByRole('button', { name: /Кузнецов Леонид, 05/ }));
  const sheet = await screen.findByRole('dialog');
  const notes = within(sheet).getByRole('region', { name: t.notes });
  expect(within(notes).getByText(t.noNotes)).toBeTruthy();
  const add = within(notes).getByRole('button', { name: t.addNote });
  expect(add.hasAttribute('disabled')).toBe(true);
  fireEvent.change(within(notes).getByLabelText(t.noteText), {
    target: { value: 'Принести новый бейдж' },
  });
  fireEvent.change(within(notes).getByLabelText(t.noteAudience), {
    target: { value: 'EMPLOYEES' },
  });
  fireEvent.change(within(notes).getByLabelText(t.noteScope), { target: { value: 'person' } });
  expect(add.hasAttribute('disabled')).toBe(false);
  fireEvent.click(add);
  await waitFor(() =>
    expect(
      calls.find((call) => call.method === 'POST' && call.path === '/admin/schedules/notes')?.body,
    ).toMatchObject({
      businessDate: '2026-09-05',
      employeeId: EMP,
      zoneId: null,
      audience: 'EMPLOYEES',
      text: 'Принести новый бейдж',
    }),
  );
  expect(await within(notes).findByText('Принести новый бейдж')).toBeTruthy();
  expect(notes.textContent).toContain(t.audienceEmployees);
  cleanup();
  vi.unstubAllGlobals();
});

it('prints the visible plan with version identity and marks an unpublished draft', async () => {
  freshState();
  mockApi({ status: 'DRAFT' });
  const written: string[] = [];
  const popup = {
    document: { open: vi.fn(), write: (html: string) => written.push(html), close: vi.fn() },
    focus: vi.fn(),
    print: vi.fn(),
  };
  const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  admin();
  await screen.findByText(t.draftState);
  await showWeekOf(/Кузнецов Леонид, 05/);
  fireEvent.click(screen.getByRole('menuitem', { name: t.print }));
  expect(open).toHaveBeenCalled();
  const html = written.join('');
  expect(html).toContain(t.printUnpublished);
  expect(html).toContain(`${t.printTimezone}:`);
  expect(html).toContain(`${t.printPeriod}: 2026-08-31 – 2026-09-06`);
  expect(html).toContain('Кузнецов Леонид');
  expect(html).toContain(`${t.printVersion}: 1`);
  expect(popup.print).toHaveBeenCalled();
  open.mockRestore();
  cleanup();
  vi.unstubAllGlobals();
});

it('shows the retrospective report with planned, recorded and unknown departure kept apart', async () => {
  freshState();
  setUiState({ 'schedule.month': '2026-09' });
  mockApi({ status: 'PUBLISHED' });
  admin();
  await screen.findByText(t.publishedState);
  fireEvent.click(screen.getByRole('menuitem', { name: t.retrospective }));
  const sheet = await screen.findByRole('dialog', { name: t.retrospective });
  const rows = await within(sheet).findAllByRole('row', { name: /Кузнецов Леонид.*12 ч/ });
  expect(rows[0]?.textContent).toContain('10 ч 10 мин');
  expect(within(sheet).getByText(t.departureUnknown)).toBeTruthy();
  expect(
    within(sheet).getByRole('button', { name: t.downloadRetrospective }).hasAttribute('disabled'),
  ).toBe(false);
  cleanup();
  vi.unstubAllGlobals();
});

it('proposes an explainable allocation for open slots and applies it through slot selection', async () => {
  freshState();
  const calls = mockApi({
    status: 'DRAFT',
    slots: [
      {
        id: 'f1000000-0000-4000-8000-000000000001',
        siteId: SITE,
        orgUnitId: UNIT,
        periodMonth: '2026-09',
        businessDate: '2026-09-06',
        templateId: TPL_DAY,
        zoneId: ZONE,
        status: 'OFFERED',
        filledEmployeeId: null,
        filledVersionId: null,
        offer: {
          id: 'f2000000-0000-4000-8000-000000000001',
          status: 'OPEN',
          audience: 'UNIT',
          notifiedCount: 2,
          offeredAt: '2026-09-01T10:00:00.000Z',
          closedAt: null,
          interests: [],
        },
        offerCount: 1,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  });
  admin();
  await screen.findByText(t.draftState);
  await screen.findByText(t.openSlotsCount.replace('{count}', '1'));
  fireEvent.click(screen.getByRole('menuitem', { name: t.proposal }));
  const sheet = await screen.findByRole('dialog', { name: t.proposal });
  const picks = await within(sheet).findByRole('region', { name: t.proposalPicks });
  // Кузнецов already works the night of the 5th; Сидоров is free and gets the day slot.
  expect(picks.textContent).toContain('2026-09-06');
  expect(picks.textContent).toContain('Сидоров Пётр');
  expect(sheet.textContent).toContain(t.proposalScope.replace('{slots}', '1').split('{')[0] ?? '');
  fireEvent.click(within(picks).getByRole('button', { name: t.skipPick }));
  const apply = () =>
    within(sheet).getByRole('button', { name: t.applyProposal.replace('{count}', '0') });
  expect(apply().hasAttribute('disabled')).toBe(true);
  fireEvent.click(within(picks).getByRole('button', { name: t.keepPick }));
  fireEvent.click(
    within(sheet).getByRole('button', { name: t.applyProposal.replace('{count}', '1') }),
  );
  await waitFor(() =>
    expect(
      calls.find((call) => call.path.endsWith('/select') && call.method === 'POST')?.body,
    ).toMatchObject({
      employeeId: EMP2,
      versionId: VERSION,
      expectedRevision: 1,
    }),
  );
  expect(
    await within(sheet).findByText(
      t.proposalApplied.replace('{count}', '1').replace('{failed}', '0'),
    ),
  ).toBeTruthy();
  cleanup();
  vi.unstubAllGlobals();
});

it('turns the conflicts pill into a highlight toggle with a list and explains the disabled publish button', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  const OTHER_UNIT = 'a0000000-0000-4000-8000-000000000012';
  mockApi({
    status: 'DRAFT',
    context: {
      intervals: [
        {
          employeeId: EMP,
          businessDate: '2026-09-05',
          startAt: '2026-09-05T18:00:00.000Z',
          endAt: '2026-09-06T02:00:00.000Z',
          orgUnitId: OTHER_UNIT,
          status: 'PUBLISHED',
        },
      ],
      absences: [],
      otherUnitEmployees: [],
    },
  });
  admin();
  await screen.findByText(t.draftState);
  const pill = await screen.findByRole('button', {
    name: t.conflictsCount.replace('{count}', '1'),
  });
  expect(pill.getAttribute('aria-pressed')).toBe('false');
  // The primary button is disabled and says why.
  expect(screen.getByRole('button', { name: t.reviewPublish }).hasAttribute('disabled')).toBe(true);
  const tip = screen.getByRole('button', { name: t.reviewPublish }).nextElementSibling;
  expect(tip?.getAttribute('data-info-tip')).not.toBeNull();
  fireEvent.pointerMove(tip as HTMLElement);
  fireEvent.pointerEnter(tip as HTMLElement);
  expect((await screen.findByRole('tooltip')).textContent).toContain(t.publishBlockedConflicts);
  await showWeekOf(/Кузнецов Леонид, 05/);
  const card = screen.getByRole('button', { name: /Кузнецов Леонид, 05/ });
  expect(card.getAttribute('data-emphasized')).toBeNull();
  fireEvent.mouseEnter(pill);
  expect(card.getAttribute('data-emphasized')).toBe('true');
  fireEvent.mouseLeave(pill);
  expect(card.getAttribute('data-emphasized')).toBeNull();
  fireEvent.click(pill);
  expect(pill.getAttribute('aria-pressed')).toBe('true');
  expect(card.getAttribute('data-emphasized')).toBe('true');
  const list = screen.getByRole('region', { name: t.conflict });
  expect(list.textContent).toContain('Кузнецов Леонид');
  expect(list.textContent).toContain('05.09');
  expect(within(list).getByRole('button', { name: /Кузнецов Леонид/ })).toBeTruthy();
  fireEvent.click(pill);
  expect(pill.getAttribute('aria-pressed')).toBe('false');
  expect(screen.queryByRole('region', { name: t.conflict })).toBeNull();
  cleanup();
  vi.unstubAllGlobals();
});

it('does not dim the visible week when every warning sits on other dates, and a list row reveals the shift', async () => {
  clearPersistentState();
  useScheduleDrafts.setState({
    drafts: {},
    baselines: {},
    revisions: {},
    past: {},
    future: {},
    recoveryError: false,
  });
  setUiState({ 'schedule.month': '2026-09' });
  // 18 day shifts (216 h) exceed the 200 h site limit; the warning lands on the last one, 30.09.
  const assignments = Array.from({ length: 18 }, (_, index) => {
    const day = String(13 + index).padStart(2, '0');
    return {
      id: `e0000000-0000-4000-8000-0000000000${day}`,
      scheduleVersionId: VERSION,
      employeeId: EMP,
      templateId: TPL_DAY,
      templateCode: 'DAY',
      businessDate: `2026-09-${day}`,
      planStartAt: `2026-09-${day}T05:00:00.000Z`,
      planEndAt: `2026-09-${day}T17:00:00.000Z`,
      positionId: null,
      orgUnitId: UNIT,
      teamId: null,
      zoneId: ZONE,
      kind: 'REGULAR',
      status: 'PLANNED',
      acknowledgedAt: null,
      customStart: null,
      customEnd: null,
      segments: [],
      breaks: [],
    };
  });
  mockApi({
    status: 'DRAFT',
    savedDetail: ScheduleVersionDetail.parse({ version: version('DRAFT', 18), assignments }),
  });
  admin();
  await screen.findByText(t.draftState);
  const pill = await screen.findByRole('button', {
    name: t.warningsCount.replace('{count}', '1'),
  });
  // The week of today (13.09) holds a shift without warnings: hovering must not fade it.
  const visibleCard = await screen.findByRole('button', { name: /Кузнецов Леонид, 13/ });
  expect(screen.queryByRole('button', { name: /Кузнецов Леонид, 30/ })).toBeNull();
  fireEvent.mouseEnter(pill);
  expect(visibleCard.getAttribute('data-emphasized')).toBeNull();
  expect(pill.getAttribute('title')).toBe(t.highlightNoneVisible);
  fireEvent.mouseLeave(pill);
  fireEvent.click(pill);
  const list = screen.getByRole('region', { name: t.warning });
  expect(list.textContent).toContain(
    t.issuesElsewhere.replace('{visible}', '0').replace('{count}', '1'),
  );
  const row = within(list).getByRole('button', { name: /Кузнецов Леонид/ });
  expect(row.textContent).toContain('30.09');
  fireEvent.click(row);
  // The period moves to the week of 30.09 and the shift opens with its reason.
  const card = await screen.findByRole('button', { name: /Кузнецов Леонид, 30/ });
  expect(card.getAttribute('aria-pressed')).toBe('true');
  const sheet = await screen.findByRole('dialog');
  expect(sheet.textContent).toContain('216');
  // The list stays behind the open panel; the modal hides it from assistive tech, so query the DOM.
  expect(document.querySelector(`section[aria-label="${t.warning}"]`)).not.toBeNull();
  cleanup();
  vi.unstubAllGlobals();
});
