import { stubFetch } from '@/test/stub-fetch';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@vakhta/i18n';
import { render } from '@/test-utils';
import { ImportDialog } from './import-dialog';

const all = messages('ru');
const e = all.admin.administration.employees;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function file(text: () => Promise<string>, name = 'employees.csv') {
  return Object.defineProperty(new File(['fixture'], name, { type: 'text/csv' }), 'text', {
    value: text,
  });
}
function choose(input: File) {
  fireEvent.change(screen.getByLabelText(e.importFile), { target: { files: [input] } });
}
function mount() {
  const props = { open: true, onOpenChange: vi.fn(), onImported: vi.fn(async () => {}) };
  return { ...render(<ImportDialog {...props} />), props };
}

describe('employee import dialog', () => {
  it('restores keyboard focus to the connected opener on close', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      onImported: vi.fn(async () => {}),
      returnFocusTo: opener,
    };
    const { rerender } = render(<ImportDialog {...props} />);
    rerender(<ImportDialog {...props} open={false} />);
    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });
  it('shows reading, empty and malformed states and never submits their content', async () => {
    mount();
    let finish: (text: string) => void = () => {
      throw new Error('Read not started');
    };
    choose(
      file(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    expect(screen.getByText(e.importReading)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: `${e.importRun} (0)` }).hasAttribute('disabled'),
    ).toBe(true);
    await act(async () => finish('personnel_number;full_name\n'));
    expect(screen.getByText(e.importEmpty)).toBeTruthy();
    choose(file(async () => '001;"unfinished'));
    expect(await screen.findByText(e.importReadErrors.MALFORMED)).toBeTruthy();
    choose(
      file(async () => {
        throw new Error('Disk unavailable');
      }),
    );
    expect(await screen.findByText(e.importReadErrors.READ_FAILED)).toBeTruthy();
  });

  it('submits only validated rows, preserves preview after failure and retries only on an explicit action', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Unavailable' }), {
          status: 500,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created: 1, skipped: [] }), { status: 200 }),
      );
    stubFetch(request);
    const { props } = mount();
    choose(file(async () => 'personnel_number;full_name\n0001;  Анна Коваль  \n0002;A'));
    const submit = await screen.findByRole('button', { name: `${e.importRun} (1)` });
    fireEvent.click(submit);
    await waitFor(() => expect(submit.hasAttribute('disabled')).toBe(false));
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Анна Коваль')).toBeTruthy();
    expect(props.onImported).not.toHaveBeenCalled();
    expect(request.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ items: [{ personnelNumber: '0001', fullName: 'Анна Коваль' }] }),
    );
    fireEvent.click(submit);
    await waitFor(() => expect(props.onImported).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('button', { name: `${e.importRun} (0)` }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('blocks duplicate submissions, replacement and dismissal while sending', async () => {
    let finish: (response: Response) => void = () => {
      throw new Error('Request not started');
    };
    const request = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    stubFetch(request);
    const { props } = mount();
    choose(file(async () => '0001;Анна Коваль'));
    const submit = await screen.findByRole('button', { name: `${e.importRun} (1)` });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(screen.getByLabelText(e.importFile).hasAttribute('disabled')).toBe(true);
    const close = screen.getByRole('button', { name: all.ui.common.close });
    expect(close.hasAttribute('disabled')).toBe(true);
    fireEvent.click(close);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(props.onOpenChange).not.toHaveBeenCalled();
    await act(async () => finish(new Response(JSON.stringify({ created: 1, skipped: [] }))));
    await waitFor(() => expect(props.onImported).toHaveBeenCalledOnce());
  });

  it('starts a fresh selection after closing even if the old file finishes later', async () => {
    const { props, rerender } = mount();
    let finish: (text: string) => void = () => {
      throw new Error('Read not started');
    };
    choose(
      file(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    rerender(<ImportDialog {...props} open={false} />);
    rerender(<ImportDialog {...props} open />);
    await act(async () => finish('0001;Old Employee'));
    expect(screen.queryByText('Old Employee')).toBeNull();
    expect(
      screen.getByRole('button', { name: `${e.importRun} (0)` }).hasAttribute('disabled'),
    ).toBe(true);
  });
});
