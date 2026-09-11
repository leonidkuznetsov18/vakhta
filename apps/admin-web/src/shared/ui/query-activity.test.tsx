import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QueryActivity } from './query-activity';

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <QueryActivity />
    </QueryClientProvider>,
  );
  return { client, view };
}

function pendingRead() {
  let finish: (value: string) => void = () => {};
  const promise = new Promise<string>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

describe('QueryActivity', () => {
  it('combines concurrent background reads in one persistent header slot', async () => {
    const { client, view } = setup();
    const slot = view.container.firstElementChild;
    const first = pendingRead();
    const second = pendingRead();
    const queries = [first, second].map(
      (read, index) =>
        new QueryObserver(client, {
          queryKey: ['background', index],
          queryFn: () => read.promise,
          initialData: 'cached',
          staleTime: Infinity,
        }),
    );
    const unsubscribe = queries.map((query) => query.subscribe(() => {}));
    const requests = queries.map((query) => query.refetch());
    await waitFor(() => expect(screen.getAllByRole('status')).toHaveLength(1));
    expect(screen.getByText('Обновляем данные…')).toBeTruthy();
    expect(view.container.firstElementChild).toBe(slot);
    await act(async () => {
      first.finish('updated');
      await requests[0];
    });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    await act(async () => {
      second.finish('updated');
      await requests[1];
    });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(view.container.firstElementChild).toBe(slot);
    unsubscribe.forEach((stop) => stop());
  });

  it('leaves initial loading and error retries to their local feedback', async () => {
    const { client } = setup();
    const read = pendingRead();
    const query = new QueryObserver(client, {
      queryKey: ['initial'],
      queryFn: () => read.promise,
    });
    const stop = query.subscribe(() => {});
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => {
      read.finish('loaded');
      await query.refetch();
    });
    const retry = pendingRead();
    query.setOptions({ queryKey: ['initial'], queryFn: () => retry.promise, staleTime: Infinity });
    client
      .getQueryCache()
      .find({ queryKey: ['initial'] })
      ?.setState({ status: 'error', error: new Error('Offline') });
    const request = query.refetch();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => {
      retry.finish('recovered');
      await request;
    });
    stop();
  });
});
