import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HandoverPage } from './HandoverPage.tsx';
import { clickRowAction } from '../test-utils.ts';

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
        note: null,
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
        note: 'Проверьте станок 3',
      },
      {
        key: 'PHOTO_OVERVIEW',
        label: 'Общий вид зоны',
        kind: 'PHOTO',
        answered: true,
        ok: true,
        remarkCategory: null,
        remarkText: null,
        safeToWork: null,
        needs: [],
        note: null,
      },
    ],
    photos: [{ itemKey: 'PHOTO_OVERVIEW', label: 'Общий вид зоны', media }],
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

  it('shows the checklist, the note and a signed photo link; the decision carries a comment', async () => {
    const state = { status: 'DISPUTED' };
    const calls = mockApi(state);
    render(<HandoverPage />);
    expect(await screen.findByText('Кузнецов Леонид')).toBeTruthy();
    await clickRowAction('Подробности');
    // The note is shown as text.
    expect(await screen.findByText('Проверьте станок 3')).toBeTruthy();
    // Nothing from the next shift is on the page any more: they stopped reviewing reports, so the
    // block that showed their acceptance and remarks is gone with them.
    expect(screen.queryByText('Петрова Ольга')).toBeNull();
    // Photos load as thumbnails through the signed link; each fetch is audited server-side.
    const thumb = await screen.findByAltText(/Общий вид зоны/);
    // A PHOTO item lives only in the photo block (its caption), not in the checklist.
    expect(screen.getAllByText('Общий вид зоны')).toHaveLength(1);
    expect(thumb.getAttribute('src')).toBe('https://storage.example/signed?x=1');
    expect(calls.some((c) => c.path === `/admin/handovers/media/${MEDIA}/link`)).toBe(true);

    // The master decides with two buttons: a remark needs its text, an approval does not.
    const remark = screen.getByRole('button', { name: 'Замечание' });
    expect((remark as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Комментарий (обязательный)'), {
      target: { value: 'Пятно появилось после передачи' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Замечание' }));
    await screen.findByText('Решение сохранено.');
    expect(calls.find((c) => c.path.endsWith('/resolve'))?.body).toEqual({
      decision: 'RESOLVED_ISSUE_CONFIRMED',
      comment: 'Пятно появилось после передачи',
    });
  });

  it('an overdue acceptance is flagged and the master can approve the checklist outright', async () => {
    const calls = mockApi({ status: 'SUBMITTED' });
    render(<HandoverPage />);
    expect(await screen.findByText(/^просрочено на/)).toBeTruthy();
    await clickRowAction('Подробности');
    // Approving needs no text: the employee is thanked and earns the point.
    const approve = await screen.findByRole('button', { name: 'Одобрить' });
    expect((approve as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(approve);
    await screen.findByText('Решение сохранено.');
    expect(calls.find((c) => c.path.endsWith('/resolve'))?.body).toMatchObject({
      decision: 'RESOLVED_ACCEPTED',
    });
  });

  it('a remark on a submitted report: the button waits for the text, then sends it', async () => {
    const calls = mockApi({ status: 'SUBMITTED' });
    render(<HandoverPage />);
    await clickRowAction('Подробности');

    const remark = await screen.findByRole('button', { name: 'Замечание' });
    // Empty, and under three characters, it stays shut — the employee needs to read what is wrong.
    expect((remark as HTMLButtonElement).disabled).toBe(true);
    const field = screen.getByLabelText('Комментарий (обязательный)');
    fireEvent.change(field, { target: { value: 'ок' } });
    expect((remark as HTMLButtonElement).disabled).toBe(true);

    // And from three on it opens: a remark used to be reachable only after a dispute, so on a plain
    // submitted report this button was disabled no matter what the master typed.
    fireEvent.change(field, { target: { value: 'Пол не вымыт под станком' } });
    expect((remark as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(remark);
    await screen.findByText('Решение сохранено.');
    expect(calls.find((c) => c.path.endsWith('/resolve'))?.body).toMatchObject({
      decision: 'RESOLVED_ISSUE_CONFIRMED',
      comment: 'Пол не вымыт под станком',
    });
  });
});
