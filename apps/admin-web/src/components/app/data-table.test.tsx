import type { QueryFeedbackState } from './query-feedback';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { render } from '../../test-utils.tsx';
import { useIsMobile } from '@/hooks/use-mobile';
import { DataTable, type Column } from './data-table.tsx';
import { clearPersistentState } from '@/lib/ui-store';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';

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

describe('DataTable: total records', () => {
  beforeEach(clearPersistentState);
  afterEach(() => {
    cleanup();
    vi.mocked(useIsMobile).mockReturnValue(false);
  });
  const t = messages(currentLocale()).ui.pagination;
  const count = (from: number, to: number, total: number) => format(t.showing, { from, to, total });
  it.each([false, true])(
    'shows the total for six rows without pagination controls (mobile=%s)',
    (mobile) => {
      vi.mocked(useIsMobile).mockReturnValue(mobile);
      render(
        <DataTable rows={rows.slice(0, 6)} columns={columns} rowKey={(r) => r.id} empty="Empty" />,
      );
      expect(screen.getByText(count(1, 6, 6))).toBeTruthy();
      expect(screen.queryByText(t.pageSize)).toBeNull();
    },
  );
  it('keeps the full filtered total across pages and page sizes', () => {
    const collection = Array.from({ length: 186 }, (_, i) => ({
      id: String(i),
      name: `Record ${i}`,
    }));
    render(
      <DataTable
        rows={collection}
        columns={columns}
        rowKey={(r) => r.id}
        empty="Empty"
        pageSize={10}
        searchText={(r) => r.name}
      />,
    );
    expect(screen.getByText(count(1, 10, 186))).toBeTruthy();
    fireEvent.click(screen.getByText(t.next));
    expect(screen.getByText(count(11, 20, 186))).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } });
    expect(screen.getByText(count(1, 50, 186))).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Record 18' } });
    expect(screen.getByText(count(1, 7, 7))).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
    expect(screen.getByText(count(0, 0, 0))).toBeTruthy();
  });
  it('shows the known server total when only a capped subset is loaded', () => {
    render(
      <DataTable
        rows={rows.slice(0, 10)}
        columns={columns}
        rowKey={(row) => row.id}
        empty="Empty"
        totalCount={186}
        truncated
      />,
    );
    expect(screen.getByText(count(1, 10, 186))).toBeTruthy();
  });
  it('shows zero only after a successful empty result', () => {
    const view = render(
      <DataTable rows={[]} columns={columns} rowKey={(r: Row) => r.id} empty="Empty" loading />,
    );
    expect(screen.queryByText(count(0, 0, 0))).toBeNull();
    view.rerender(
      <DataTable rows={[]} columns={columns} rowKey={(r: Row) => r.id} empty="Empty" />,
    );
    expect(screen.getByText(count(0, 0, 0))).toBeTruthy();
  });
});

describe('DataTable: common keyboard and mobile contract', () => {
  beforeEach(clearPersistentState);
  afterEach(() => {
    cleanup();
    vi.mocked(useIsMobile).mockReturnValue(false);
  });
  const sortable: Column<Row>[] = [{ ...columns[0]!, sortValue: (row) => row.name }];
  it.each([false, true])(
    'announces disclosure and restores focus after Escape (mobile=%s)',
    (mobile) => {
      vi.mocked(useIsMobile).mockReturnValue(mobile);
      const toggle = vi.fn();
      render(
        <DataTable
          rows={[rows[0]!]}
          columns={sortable}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.name}
          empty="Empty"
          onRowClick={toggle}
          expanded={() => <input aria-label="Detail field" />}
        />,
      );
      const trigger = screen.getByRole('button', { name: 'Подробности: Работник 1' });
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(document.getElementById(trigger.getAttribute('aria-controls')!)).toBeTruthy();
      fireEvent.keyDown(screen.getByLabelText('Detail field'), { key: 'Escape' });
      expect(toggle).toHaveBeenCalledOnce();
      expect(document.activeElement).toBe(trigger);
    },
  );
  it.each([false, true])(
    'labels visible-page mixed selection and keeps totals available (mobile=%s)',
    (mobile) => {
      vi.mocked(useIsMobile).mockReturnValue(mobile);
      const select = vi.fn();
      render(
        <DataTable
          rows={rows}
          columns={sortable}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.name}
          empty="Empty"
          selectedKeys={new Set(['r1'])}
          onSelectionChange={select}
          pageSize={10}
          summary={[{ label: 'Downtime minutes', value: 300 }]}
        />,
      );
      const all = screen.getByRole('checkbox', { name: 'Выбрать все строки на этой странице' });
      expect(all.getAttribute('aria-checked')).toBe('mixed');
      expect(screen.getByRole('checkbox', { name: 'Работник 1' })).toBeTruthy();
      fireEvent.click(all);
      expect(select.mock.calls[0]?.[0].size).toBe(10);
      expect(screen.getByText('300')).toBeTruthy();
      expect(screen.getByText('Downtime minutes')).toBeTruthy();
    },
  );
  it('sorts numerically on desktop and offers the same order on mobile', () => {
    const view = render(
      <DataTable
        rows={[rows[9]!, rows[1]!]}
        columns={sortable}
        rowKey={(row) => row.id}
        empty="Empty"
        storageKey="sort-test"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Работник: Сортировать по возрастанию' }));
    expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Работник 2',
      'Работник 10',
    ]);
    vi.mocked(useIsMobile).mockReturnValue(true);
    view.rerender(
      <DataTable
        rows={[rows[9]!, rows[1]!]}
        columns={sortable}
        rowKey={(row) => row.id}
        empty="Empty"
        storageKey="sort-test"
      />,
    );
    expect((screen.getByRole('combobox', { name: 'Сортировка' }) as HTMLSelectElement).value).toBe(
      'name:asc',
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Сортировка' }), {
      target: { value: 'name:desc' },
    });
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Работник 10',
      'Работник 2',
    ]);
  });
  it('isolates unnamed sibling searches and resets pagination on external filters', () => {
    const view = render(
      <>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          empty="Empty"
          searchText={(row) => row.name}
        />
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          empty="Empty"
          searchText={(row) => row.name}
        />
      </>,
    );
    fireEvent.change(screen.getAllByRole('searchbox')[0]!, { target: { value: 'missing' } });
    expect((screen.getAllByRole('searchbox')[1]! as HTMLInputElement).value).toBe('');
    view.unmount();
    const page = (resetKey: string) => (
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        empty="Empty"
        resetKey={resetKey}
      />
    );
    const next = render(page('site-a'));
    fireEvent.click(screen.getByText(messages(currentLocale()).ui.pagination.next));
    expect(screen.getByText('Работник 21')).toBeTruthy();
    next.rerender(page('site-b'));
    expect(screen.getByText('Работник 1')).toBeTruthy();
    expect(screen.queryByText('Работник 21')).toBeNull();
  });
  it('discloses a capped response and blocks actions targeting hidden selections', () => {
    render(
      <DataTable
        rows={[rows[0]!]}
        columns={columns}
        rowKey={(row) => row.id}
        empty="Empty"
        truncated
        selectedKeys={new Set(['missing'])}
        onSelectionChange={() => undefined}
        selectionBar={<button>Bulk mutation</button>}
      />,
    );
    expect(screen.queryByText('Bulk mutation')).toBeNull();
    expect(screen.getByText(messages(currentLocale()).ui.common.loadedSubset)).toBeTruthy();
  });
});
