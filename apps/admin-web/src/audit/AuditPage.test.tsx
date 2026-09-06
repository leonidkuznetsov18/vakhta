import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AuditPage } from './AuditPage.tsx';

const ENTRY = 'e0000000-0000-4000-8000-000000000001';
const TERMINAL = '9e81f796-0000-4000-8000-000000000002';

const entries = [
  {
    id: ENTRY,
    at: '2026-09-06T16:12:03.000Z',
    actorType: 'WEB_USER',
    actorId: 'c3a5b1f8-6401-4c72-ac7c-9fe504f33d87',
    actorName: 'admin@example.com',
    action: 'qr_terminal.update',
    objectType: 'qr_terminal',
    objectId: TERMINAL,
    before: { name: 'Main', siteId: TERMINAL, checkpoint: 'BOTH' },
    after: { name: 'Main gate', siteId: TERMINAL, checkpoint: 'BOTH' },
    reason: 'тест',
  },
];

function mockApi() {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/admin/audit') return json(entries);
      if (url.pathname === '/admin/audit/events') return json([]);
      return json({ code: 'NOT_FOUND', message: url.pathname }, 404);
    }),
  );
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async () => undefined } });
}

describe('AuditPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('names the actor, opens details from a visible button and lists the changed fields', async () => {
    mockApi();
    render(<AuditPage />);
    expect((await screen.findAllByText('admin@example.com')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Терминал изменён').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Подробности' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Изменено полей: 1')).toBeTruthy();
    const row = within(sheet).getByText('name').closest('tr')!;
    expect(within(row).getByText('Main')).toBeTruthy();
    expect(within(row).getByText('Main gate')).toBeTruthy();
    // The full identifier is visible and copyable, not clipped.
    expect(within(sheet).getAllByText(TERMINAL).length).toBeGreaterThan(0);
    expect(within(sheet).getAllByRole('button', { name: 'Скопировать' }).length).toBeGreaterThan(0);
  });
});
