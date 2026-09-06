import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HandoverPage } from './HandoverPage.tsx';

const SITE = 'a0000000-0000-4000-8000-000000000001';
const HV = 'c0000000-0000-4000-8000-000000000001';
const MEDIA = 'd0000000-0000-4000-8000-000000000001';

const org = {
  sites: [{ id: SITE, code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' }],
  orgUnits: [],
  teams: [],
  positions: [],
  zones: [],
  terminals: [],
  reasonCodes: [
    {
      kind: 'HANDOVER',
      code: 'DIRT',
      label: 'Загрязнение',
      requiresComment: false,
      requiresPhoto: false,
      notifyMaster: false,
      severity: 'NORMAL',
      isActive: true,
    },
  ],
};

const media = {
  id: MEDIA,
  quality: 'OK',
  width: 1280,
  height: 960,
  receivedAt: '2026-09-07T16:00:00.000Z',
  processedAt: '2026-09-07T16:01:00.000Z',
  duplicateOfId: null,
};

function handover(status: string) {
  return {
    id: HV,
    shiftSessionId: 's',
    zoneId: 'z',
    zoneName: 'Линия A',
    submittedBy: 'e1',
    submittedByName: 'Кузнецов Леонид',
    checklistDefinitionId: 'def',
    checklistVersion: 1,
    status,
    version: 2,
    items: [
      {
        key: 'FLOOR',
        label: 'Пол чистый',
        kind: 'CHECK',
        answered: true,
        ok: false,
        remarkCategory: 'DIRT',
        remarkText: 'Пятно',
        safeToWork: true,
        needs: ['CLEANING'],
      },
      {
        key: 'MESSAGE_NEXT',
        label: 'Сообщение следующей смене',
        kind: 'NOTE',
        answered: true,
        ok: true,
        remarkCategory: null,
        remarkText: null,
        safeToWork: null,
        needs: [],
      },
    ],
    photos: [{ angle: 'OVERVIEW', media }],
    issues: [],
    cannotCompleteReason: null,
    cannotCompleteComment: null,
    submittedAt: '2026-09-07T16:30:00.000Z',
    acceptDeadlineAt: '2026-09-07T17:30:00.000Z',
    escalatedToMasterAt: null,
    supersededById: null,
    createdAt: '2026-09-07T16:00:00.000Z',
  };
}

class FakeEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {}
  addEventListener() {}
  close() {}
}

function mockApi(state: { status: string }) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, path: url.pathname, body });
      if (url.pathname === '/admin/org') return json(org);
      if (url.pathname === '/admin/handovers') {
        const { items, issues, ...rest } = handover(state.status);
        void items;
        void issues;
        return json([
          {
            ...rest,
            remarks: 1,
            overdue: state.status === 'SUBMITTED',
            reviewDecision: state.status === 'DISPUTED' ? 'ISSUE' : null,
          },
        ]);
      }
      if (url.pathname === `/admin/handovers/${HV}`) {
        return json({
          handover: handover(state.status),
          reviews:
            state.status === 'DISPUTED'
              ? [
                  {
                    id: 'r1',
                    reviewerEmployeeId: 'e2',
                    reviewerName: 'Петрова Ольга',
                    decision: 'ISSUE',
                    category: 'DIRT',
                    comment: 'Грязно',
                    media,
                    reviewedAt: '2026-09-07T17:00:00.000Z',
                    incidentId: null,
                  },
                ]
              : [],
          resolutions: [],
          serverTime: 'x',
        });
      }
      if (url.pathname === `/admin/handovers/${HV}/resolve`) {
        state.status = body.decision;
        return json(handover(state.status));
      }
      if (url.pathname === `/admin/handovers/media/${MEDIA}/link`) {
        return json({ url: 'https://storage.example/signed?x=1', expiresAt: 'x' });
      }
      return json({ code: 'NOT_FOUND', message: url.pathname }, 404);
    }),
  );
  return calls;
}

describe('HandoverPage', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows a dispute with the checklist, the receiver remark and a signed photo link; the decision carries a comment', async () => {
    const state = { status: 'DISPUTED' };
    const calls = mockApi(state);
    render(<HandoverPage />);
    expect(await screen.findByText('Кузнецов Леонид')).toBeTruthy();
    expect(screen.getByText('Есть замечание принимающего')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Подробности' }));
    expect(await screen.findByText('Петрова Ольга')).toBeTruthy();
    expect(screen.getByText(/Пятно/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Открыть фото' })[0]!);
    const link = await screen.findByRole('link', { name: 'Открыть фото' });
    expect(link.getAttribute('href')).toBe('https://storage.example/signed?x=1');
    expect(calls.some((c) => c.path === `/admin/handovers/media/${MEDIA}/link`)).toBe(true);

    const decision = screen.getByLabelText('Решение') as HTMLSelectElement;
    expect([...decision.options].map((o) => o.value)).toEqual([
      '',
      'RESOLVED_ACCEPTED',
      'RESOLVED_ISSUE_CONFIRMED',
      'RESOLVED_NO_FAULT',
    ]);
    fireEvent.change(decision, { target: { value: 'RESOLVED_NO_FAULT' } });
    fireEvent.change(screen.getByLabelText('Комментарий (обязательно)'), {
      target: { value: 'Пятно появилось после передачи' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Принять решение' }));
    await screen.findByText('Решение сохранено.');
    expect(calls.find((c) => c.path.endsWith('/resolve'))?.body).toEqual({
      decision: 'RESOLVED_NO_FAULT',
      comment: 'Пятно появилось после передачи',
    });
  });

  it('an overdue acceptance is flagged and allows only master decisions without confirming a violation', async () => {
    mockApi({ status: 'SUBMITTED' });
    render(<HandoverPage />);
    expect(await screen.findByText('Просрочено')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Подробности' }));
    const decision = (await screen.findByLabelText('Решение')) as HTMLSelectElement;
    expect([...decision.options].map((o) => o.value)).toEqual([
      '',
      'RESOLVED_ACCEPTED',
      'RESOLVED_NO_FAULT',
    ]);
  });
});
