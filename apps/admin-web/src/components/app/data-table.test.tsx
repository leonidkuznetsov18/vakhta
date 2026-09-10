import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { render } from '../../test-utils.tsx';
import { DataTable, type Column } from './data-table.tsx';

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
  afterEach(cleanup);

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
