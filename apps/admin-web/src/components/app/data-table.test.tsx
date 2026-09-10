import type { QueryFeedbackState } from './query-feedback';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { render } from '../../test-utils.tsx';
import { useIsMobile } from '@/hooks/use-mobile';
import { DataTable, type Column } from './data-table.tsx';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: vi.fn(() => false) }));

interface Row {
  readonly id: string;
  readonly name: string;
}

const rows: Row[] = Array.from({ length: 45 }, (_, i) => ({
  id: `r${i + 1}`,
  name: `Работник ${i + 1}`,
}));
const columns: Column<Row>[] = [{ key: 'name', header: 'Работник', cell: (r) => r.name }];

function table(activeKey: string | null) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      empty="Нет строк"
      activeKey={activeKey}
      expanded={(r) => (r.id === activeKey ? <span>детали {r.name}</span> : null)}
    />
  );
}

describe('DataTable: the row the address points at', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it('turns to the page holding it and brings it into view', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    // Page size is 20, so row 41 is on the third page: without turning there, a deep link from
    // the overview lands on a list that does not contain the row it promised.
    render(table('r41'));

    expect(screen.getByText('Работник 41')).toBeTruthy();
    expect(screen.getByText('детали Работник 41')).toBeTruthy();
    expect(screen.queryByText('Работник 1')).toBeNull();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
  });

  it('keeps mobile details open while reading their text', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const toggle = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={[rows[0]!]}
        rowKey={(r) => r.id}
        empty="Empty"
        onRowClick={toggle}
        expanded={() => <p>Long incident explanation</p>}
      />,
    );
    fireEvent.click(screen.getByText('Long incident explanation'));
    expect(toggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Работник 1'));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('distinguishes loading, failure, offline and successful empty results', () => {
    const refetch = vi.fn(async () => undefined);
    const state: QueryFeedbackState = {
      isPending: true,
      isFetching: true,
      isError: false,
      fetchStatus: 'fetching',
      error: null,
      refetch,
    };
    const emptyTable = (queryState: QueryFeedbackState) => (
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty="No records"
        queryState={queryState}
      />
    );
    const view = render(emptyTable(state));
    expect(screen.queryByText('No records')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
    view.rerender(emptyTable({ ...state, isFetching: false, fetchStatus: 'idle' }));
    expect(screen.queryByText('No records')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
    view.rerender(emptyTable({ ...state, isFetching: false, fetchStatus: 'paused' }));
    expect(screen.getByText(/Нет соединения/)).toBeTruthy();
    expect(screen.queryByText('No records')).toBeNull();
    view.rerender(
      emptyTable({
        ...state,
        isPending: false,
        isFetching: false,
        fetchStatus: 'idle',
        isError: true,
        error: new Error('Network failed'),
      }),
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('No records')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }));
    expect(refetch).toHaveBeenCalledOnce();
    view.rerender(
      emptyTable({ ...state, isPending: false, isFetching: false, fetchStatus: 'idle' }),
    );
    expect(screen.getByText('No records')).toBeTruthy();
  });

  it('retains cached rows while a background request refreshes or fails', () => {
    const state: QueryFeedbackState = {
      isPending: false,
      isFetching: true,
      isError: false,
      fetchStatus: 'fetching',
      error: null,
      refetch: async () => undefined,
    };
    const cached = (queryState: QueryFeedbackState) => (
      <DataTable
        columns={columns}
        rows={[rows[0]!]}
        rowKey={(r) => r.id}
        empty="No records"
        queryState={queryState}
      />
    );
    const view = render(cached(state));
    expect(screen.getByText('Работник 1')).toBeTruthy();
    expect(screen.getByText('Обновляем данные…')).toBeTruthy();
    view.rerender(
      cached({
        ...state,
        isFetching: false,
        isError: true,
        fetchStatus: 'idle',
        error: new Error('Network failed'),
      }),
    );
    expect(screen.getByText('Работник 1')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('scrolls once per row, not on every render', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const view = render(table('r41'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    view.rerender(table('r41'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    view.rerender(table('r7'));
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
