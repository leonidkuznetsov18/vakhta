import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '../../test-utils.tsx';
import { MessageEmployeeDialog } from './message-employee.tsx';

const LINKED = 'b0000000-0000-4000-8000-000000000001';
const UNLINKED = 'b0000000-0000-4000-8000-000000000002';
const DISMISSED = 'b0000000-0000-4000-8000-000000000003';

function employee(id: string, fullName: string, over: Record<string, unknown> = {}) {
  return {
    id,
    personnelNumber: '001',
    fullName,
    status: 'ACTIVE',
    telegramLinked: true,
    email: null,
    phone: null,
    telegramUsername: null,
    currentPosition: null,
    createdAt: 'x',
    ...over,
  };
}

function mockApi() {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({
        method: init?.method ?? 'GET',
        path: url.pathname,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      const json = (data: unknown) =>
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (url.pathname === '/admin/employees') {
        return json([
          employee(LINKED, 'Ткач Олена'),
          employee(UNLINKED, 'Панов Олег', { telegramLinked: false }),
          employee(DISMISSED, 'Сидоров Пётр', { status: 'DISMISSED' }),
        ]);
      }
      if (url.pathname === `/admin/employees/${LINKED}/message`) {
        return json({ employeeId: LINKED, fullName: 'Ткач Олена' });
      }
      return json({ code: 'NOT_FOUND', message: url.pathname });
    }),
  );
  return calls;
}

describe('MessageEmployeeDialog', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('offers only people with a bot, and sends the text to the one chosen', async () => {
    const calls = mockApi();
    const onOpenChange = vi.fn();
    render(<MessageEmployeeDialog open onOpenChange={onOpenChange} />);

    const picker = (await screen.findByLabelText('Сотрудник')) as HTMLSelectElement;
    // A message to somebody without Telegram, or no longer employed, would sit in the outbox.
    await waitFor(() => expect(picker.options).toHaveLength(2));
    expect([...picker.options].map((o) => o.value)).toEqual(['', LINKED]);

    const send = screen.getByRole('button', { name: 'Отправить' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    fireEvent.change(picker, { target: { value: LINKED } });
    fireEvent.change(screen.getByLabelText('Сообщение'), {
      target: { value: 'Зателефонуй майстру після зміни' },
    });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      path: `/admin/employees/${LINKED}/message`,
      body: { text: 'Зателефонуй майстру після зміни' },
    });
  });

  it('reads the list only once the dialog is open', () => {
    const calls = mockApi();
    render(<MessageEmployeeDialog open={false} onOpenChange={vi.fn()} />);
    expect(calls).toHaveLength(0);
  });
});
