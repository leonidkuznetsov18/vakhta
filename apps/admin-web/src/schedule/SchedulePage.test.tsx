import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SchedulePage } from './SchedulePage.tsx';
import { useScheduleDrafts } from './store.ts';
import { NavigationProvider } from '../navigation.tsx';

const SITE = 'a0000000-0000-4000-8000-000000000001';
const UNIT = 'a0000000-0000-4000-8000-000000000002';
const ZONE = 'a0000000-0000-4000-8000-000000000003';
const EMP = 'b0000000-0000-4000-8000-000000000001';
const EMP2 = 'b0000000-0000-4000-8000-000000000002';
const TPL_DAY = 'c0000000-0000-4000-8000-000000000001';
const TPL_NIGHT = 'c0000000-0000-4000-8000-000000000002';
const VERSION = 'd0000000-0000-4000-8000-000000000001';
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
    createdAt: 'x',
  },
  {
    id: EMP2,
    personnelNumber: '0002',
    fullName: 'Сидоров Пётр',
    status: 'ACTIVE',
    telegramLinked: false,
    currentPosition: null,
    createdAt: 'x',
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
      },
    ],
  };
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function mockApi(state: { status: string; created?: boolean }, snapshot: typeof org = org) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const path = url.pathname + url.search;
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (path === '/admin/org') return json(snapshot);
    if (path === '/admin/employees') return json(employees);
    if (path.startsWith('/admin/schedules/templates')) return json(templates);
    if (path.startsWith('/admin/schedules?')) {
      const list = [version(state.status)];
      // Once a draft has been created it is part of the month, like it would be on the server.
      if (state.created) {
        list.unshift({ ...version('DRAFT'), id: 'v2', versionNo: 2, supersedesId: null });
      }
      return json(list);
    }
    if (path === '/admin/schedules' && method === 'POST') {
      state.created = true;
      return json({ ...version('DRAFT'), id: 'v2', versionNo: 2, supersedesId: null }, 201);
    }
    if (path === '/admin/schedules/v2') {
      const d = detail('DRAFT');
      return json({ ...d, version: { ...d.version, id: 'v2', versionNo: 2 }, assignments: [] });
    }
    if (path === `/admin/schedules/${VERSION}`) return json(detail(state.status));
    if (path === `/admin/schedules/${VERSION}/assignments` && method === 'PUT') {
      return json(detail(state.status));
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
      return json({ ...version('PUBLISHED'), id: 'v2', versionNo: 2, supersedesId: VERSION });
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
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

describe('SchedulePage', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.setSystemTime(new Date('2026-09-06T10:00:00Z'));
    // The store lives in a module, so clearing storage between tests is not enough.
    useScheduleDrafts.setState({ drafts: {} });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('a unit without zones says so above the grid and points to the directories', async () => {
    mockApi({ status: 'DRAFT' }, { ...org, zones: [] });
    render(<SchedulePage />);
    expect(await screen.findByText(/нет активных зон/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Открыть справочники' })).toBeTruthy();
  });

  it('shows filters, the version, the grid with an assignment and saves changes with PUT', async () => {
    const calls = mockApi({ status: 'DRAFT' });
    render(<SchedulePage />);

    expect(await screen.findByText('Цех фасовки')).toBeTruthy();
    expect(await screen.findByText(/Версия 1 · Черновик/)).toBeTruthy();
    const cell = (await screen.findByLabelText('Кузнецов Леонид 2026-09-05')) as HTMLSelectElement;
    expect(cell.value).toBe(TPL_NIGHT);

    const save = screen.getByRole('button', { name: /Сохранить/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Кузнецов Леонид 2026-09-07'), {
      target: { value: TPL_DAY },
    });
    expect(save.disabled).toBe(false);
    expect(screen.getByText('Есть несохранённые изменения.')).toBeTruthy();

    fireEvent.click(save);
    await screen.findByText('Изменения сохранены.');
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).toEqual({
      items: [
        {
          employeeId: EMP,
          templateId: TPL_NIGHT,
          businessDate: '2026-09-05',
          kind: 'REGULAR',
          zoneId: ZONE,
        },
        {
          employeeId: EMP,
          templateId: TPL_DAY,
          businessDate: '2026-09-07',
          kind: 'REGULAR',
          zoneId: ZONE,
        },
      ],
    });
  });

  it('after submission shows the review buttons, after publishing the acknowledgement table', async () => {
    const state = { status: 'DRAFT' };
    const calls = mockApi(state);
    render(<SchedulePage />);
    const submit = (await screen.findByRole('button', {
      name: 'Отправить на согласование',
    })) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);

    const publish = (await screen.findByRole('button', {
      name: 'Опубликовать',
    })) as HTMLButtonElement;
    expect(screen.getByText(/Версия 1 · На согласовании/)).toBeTruthy();
    expect(
      (screen.getByLabelText('Кузнецов Леонид 2026-09-05') as HTMLSelectElement).disabled,
    ).toBe(true);

    fireEvent.click(publish);
    // Publishing asks for confirmation and an optional reason in a dialog.
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText(/Причина изменения графика/), {
      target: { value: 'Перестановка после отпуска' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Опубликовать' }));
    await screen.findByText('График опубликован. Уведомления отправлены.');
    expect(calls.find((c) => c.path.endsWith('/publish'))?.body).toEqual({
      changeReason: 'Перестановка после отпуска',
    });
    expect(await screen.findByText('Ознакомлены')).toBeTruthy();
    expect(screen.getByText('0/1')).toBeTruthy();
  });

  it('an approver edits a published month in place: the grid is live and "Publish changes" revises', async () => {
    const calls = mockApi({ status: 'PUBLISHED' });
    render(
      <NavigationProvider go={() => undefined} roles={['PRODUCTION_HEAD']}>
        <SchedulePage />
      </NavigationProvider>,
    );
    expect(await screen.findByText(/редактируете опубликованный/)).toBeTruthy();
    const publishChanges = screen.getByRole('button', { name: /Опубликовать изменения/ });
    expect((publishChanges as HTMLButtonElement).disabled).toBe(true);
    // change the second day of the only row to a day shift
    const cell = screen.getByLabelText('Кузнецов Леонид 2026-09-02') as HTMLSelectElement;
    fireEvent.change(cell, { target: { value: TPL_DAY } });
    expect((publishChanges as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(publishChanges);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Опубликовать изменения' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === `/admin/schedules/${VERSION}/revise`)).toBeTruthy(),
    );
    const body = calls.find((c) => c.path === `/admin/schedules/${VERSION}/revise`)?.body as {
      items: { businessDate: string }[];
    };
    expect(body.items.some((i) => i.businessDate === '2026-09-02')).toBe(true);
    expect((await screen.findByRole('status')).textContent).toContain('Опубликована версия 2');
  });

  it('a published version offers "Change the schedule" to a planner: a draft copy is created from it', async () => {
    const calls = mockApi({ status: 'PUBLISHED' });
    render(<SchedulePage />);
    expect(await screen.findByText(/закрыта для правок/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Изменить график' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST' && c.path === '/admin/schedules')).toBeTruthy(),
    );
    expect(
      calls.find((c) => c.method === 'POST' && c.path === '/admin/schedules')?.body,
    ).toMatchObject({ basedOnVersionId: VERSION });
    expect(await screen.findByRole('status')).toBeTruthy();
    expect((await screen.findByRole('status')).textContent).toContain(
      'Создана версия 2 на основе версии',
    );
  });

  it('arriving from the overview opens a draft with those people already in the grid', async () => {
    // What "Build a schedule" hands over: this unit, this month, these people by name.
    sessionStorage.setItem(
      'vakhta.ui.schedule.preset',
      JSON.stringify({
        orgUnitId: UNIT,
        month: '2026-09',
        people: [{ id: EMP2, name: 'Сидоров Пётр' }],
      }),
    );
    const state = { status: 'PUBLISHED' as string, created: false };
    const calls = mockApi(state);
    render(<SchedulePage />);

    // The month had only a published version, so a draft is created to hold the newcomers.
    await waitFor(() => expect(state.created).toBe(true));
    expect(calls.filter((c) => c.method === 'POST' && c.path === '/admin/schedules')).toHaveLength(
      1,
    );
    // The person is a row of the grid, ready for shifts: that row is what tells the master whom
    // this month is being written for, so nothing repeats it above the grid.
    expect(await screen.findByRole('button', { name: /Действия: Сидоров Пётр/ })).toBeTruthy();
    // Nobody has a shift yet, so the month cannot go for approval: the server refuses an empty
    // version, and the button says so without spending a round trip on it.
    expect(
      (
        screen.getByRole('button', {
          name: 'Отправить на согласование',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('unsaved rows survive leaving the section and coming back', async () => {
    sessionStorage.setItem(
      'vakhta.ui.schedule.preset',
      JSON.stringify({
        orgUnitId: UNIT,
        month: '2026-09',
        people: [{ id: EMP2, name: 'Сидоров Пётр' }],
      }),
    );
    const state = { status: 'DRAFT' as string, created: false };
    const calls = mockApi(state);
    const first = render(<SchedulePage />);
    await screen.findByRole('button', { name: /Действия: Сидоров Пётр/ });

    // Another section, then back: the page is unmounted and the version is read from a server
    // that never saw these rows, so without a store they would be gone.
    first.unmount();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    render(<SchedulePage />);
    expect(await screen.findByRole('button', { name: /Действия: Сидоров Пётр/ })).toBeTruthy();
    expect(await screen.findByText('Есть несохранённые изменения.')).toBeTruthy();
  });

  it('arriving when the month already has a draft fills that draft instead of making another', async () => {
    sessionStorage.setItem(
      'vakhta.ui.schedule.preset',
      JSON.stringify({
        orgUnitId: UNIT,
        month: '2026-09',
        people: [{ id: EMP2, name: 'Сидоров Пётр' }],
      }),
    );
    const state = { status: 'DRAFT' as string, created: false };
    const calls = mockApi(state);
    render(<SchedulePage />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Действия: Сидоров Пётр/ })).toBeTruthy(),
    );
    expect(calls.some((c) => c.method === 'POST' && c.path === '/admin/schedules')).toBe(false);
  });
});
