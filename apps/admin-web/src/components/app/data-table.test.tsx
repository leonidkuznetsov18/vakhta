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
