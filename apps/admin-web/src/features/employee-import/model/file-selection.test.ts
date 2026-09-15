import { describe, expect, it, vi } from 'vitest';
import { createFileSelection } from './file-selection';
import { MAX_IMPORT_FILE_BYTES } from './preview';

function deferred() {
  let resolve: (value: string) => void = () => {
    throw new Error('Promise not initialized');
  };
  let reject: (reason: Error) => void = () => {
    throw new Error('Promise not initialized');
  };
  const promise = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const file = (name: string, text: () => Promise<string>) => ({ name, size: 100, text });

describe('employee import file ownership', () => {
  it.each(['resolve', 'reject'] as const)(
    'ignores stale %s after selecting another file',
    async (outcome) => {
      const old = deferred();
      const selection = createFileSelection();
      const reading = selection.select(file('old.csv', () => old.promise));
      await selection.select(file('new.csv', async () => '002;Анна Коваль'));
      if (outcome === 'resolve') old.resolve('001;Іван Коваль');
      else old.reject(new Error('file unreadable'));
      await reading;
      expect(selection.store.getState()).toMatchObject({
        status: 'ready',
        fileName: 'new.csv',
        preview: { command: { items: [{ personnelNumber: '002' }] } },
      });
    },
  );
  it('clears an old preview while reading and invalidates it on close', async () => {
    const next = deferred();
    const selection = createFileSelection();
    await selection.select(file('first.csv', async () => '001;Анна Коваль'));
    const reading = selection.select(file('next.csv', () => next.promise));
    expect(selection.store.getState()).toEqual({ status: 'reading', fileName: 'next.csv' });
    selection.reset();
    next.resolve('002;Іван Коваль');
    await reading;
    expect(selection.store.getState()).toEqual({ status: 'idle' });
  });
  it('reports a read error and recovers on a new selection', async () => {
    const selection = createFileSelection();
    await selection.select(
      file('bad.csv', async () => {
        throw new Error('unreadable');
      }),
    );
    expect(selection.store.getState()).toMatchObject({ status: 'error', error: 'READ_FAILED' });
    await selection.select(file('good.csv', async () => '001;Анна Коваль'));
    expect(selection.store.getState().status).toBe('ready');
  });
  it('rejects an oversized file before reading it', async () => {
    const text = vi.fn(async () => '001;Анна Коваль');
    const selection = createFileSelection();
    await selection.select({ name: 'large.csv', size: MAX_IMPORT_FILE_BYTES + 1, text });
    expect(text).not.toHaveBeenCalled();
    expect(selection.store.getState()).toMatchObject({ status: 'error', error: 'FILE_TOO_LARGE' });
  });
});
