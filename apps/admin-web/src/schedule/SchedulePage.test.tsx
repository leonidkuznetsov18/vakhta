import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SchedulePage } from './SchedulePage.tsx';

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
    createdAt: 'x',
  },
  {
    id: EMP2,
    personnelNumber: '0002',
    fullName: 'Сидоров Пётр',
    status: 'ACTIVE',
    telegramLinked: false,
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
  };
}

function detail(status: string, issues: unknown[] = []) {
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
    issues,
  };
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function mockApi(state: { status: string; issues?: unknown[] }) {
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
    if (path === '/admin/org') return json(org);
    if (path === '/admin/employees') return json(employees);
    if (path.startsWith('/admin/schedules/templates')) return json(templates);
    if (path.startsWith('/admin/schedules?')) return json([version(state.status)]);
    if (path === `/admin/schedules/${VERSION}`) return json(detail(state.status, state.issues));
    if (path === `/admin/schedules/${VERSION}/assignments` && method === 'PUT') {
      return json(detail(state.status, state.issues));
    }
    if (path === `/admin/schedules/${VERSION}/submit`) {
      state.status = 'IN_REVIEW';
      return json(version('IN_REVIEW'));
    }
    if (path === `/admin/schedules/${VERSION}/publish`) {
      state.status = 'PUBLISHED';
      return json(version('PUBLISHED'));
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
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('показує фільтри, версію, сітку з призначенням і зберігає зміни командою PUT', async () => {
    const calls = mockApi({ status: 'DRAFT' });
    render(<SchedulePage />);

    expect(await screen.findByText('Цех фасовки')).toBeTruthy();
    expect(await screen.findByText('Черновик')).toBeTruthy();
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
    expect(screen.getByText('Замечаний нет.')).toBeTruthy();
  });

  it('помилки валідації блокують подання, попередження ні', async () => {
    mockApi({
      status: 'DRAFT',
      issues: [
        {
          code: 'REST_TOO_SHORT',
          severity: 'ERROR',
          employeeId: EMP,
          assignmentIds: [ASSIGN],
          details: { restMinutes: 300 },
        },
        {
          code: 'NIGHT_SHARE_UNBALANCED',
          severity: 'WARNING',
          employeeId: EMP,
          assignmentIds: [],
          details: {},
        },
      ],
    });
    render(<SchedulePage />);
    expect(await screen.findByText('Отдых между сменами меньше нормы')).toBeTruthy();
    expect(screen.getByText('Дисбаланс дневных и ночных смен')).toBeTruthy();
    expect(screen.getByText('restMinutes: 300')).toBeTruthy();
    const submit = screen.getByRole('button', {
      name: 'Отправить на согласование',
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('після подання показує кнопки согласования, після публікації таблицю ознайомлення', async () => {
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
    expect(screen.getByText('На согласовании')).toBeTruthy();
    expect(
      (screen.getByLabelText('Кузнецов Леонид 2026-09-05') as HTMLSelectElement).disabled,
    ).toBe(true);

    vi.stubGlobal('confirm', () => true);
    vi.stubGlobal('prompt', () => 'Перестановка после отпуска');
    fireEvent.click(publish);
    await screen.findByText('График опубликован. Уведомления отправлены.');
    expect(calls.find((c) => c.path.endsWith('/publish'))?.body).toEqual({
      changeReason: 'Перестановка после отпуска',
    });
    expect(await screen.findByText('Ознакомлены')).toBeTruthy();
    expect(screen.getByText('0/1')).toBeTruthy();
  });
});
