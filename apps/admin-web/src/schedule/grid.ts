import type { AssignmentInput, ScheduleVersionDetail } from '@vakhta/contracts';

/** Стан редактора: рядок на працівника, комірка на день, зона на рядок. */
export interface GridRow {
  readonly employeeId: string;
  readonly zoneId: string;
  /** businessDate → templateId */
  readonly cells: Readonly<Record<string, string>>;
}

export interface GridState {
  readonly rows: readonly GridRow[];
}

export function gridFromDetail(detail: ScheduleVersionDetail): GridState {
  const byEmployee = new Map<string, { zoneId: string; cells: Record<string, string> }>();
  for (const a of detail.assignments) {
    if (a.status !== 'PLANNED') continue;
    const row = byEmployee.get(a.employeeId) ?? { zoneId: a.zoneId ?? '', cells: {} };
    row.cells[a.businessDate] = a.templateId;
    if (!row.zoneId && a.zoneId) row.zoneId = a.zoneId;
    byEmployee.set(a.employeeId, row);
  }
  return {
    rows: [...byEmployee.entries()].map(([employeeId, r]) => ({
      employeeId,
      zoneId: r.zoneId,
      cells: r.cells,
    })),
  };
}

export function gridToItems(grid: GridState): AssignmentInput[] {
  const items: AssignmentInput[] = [];
  for (const row of grid.rows) {
    for (const [businessDate, templateId] of Object.entries(row.cells)) {
      if (!templateId) continue;
      items.push({
        employeeId: row.employeeId,
        templateId,
        businessDate,
        kind: 'REGULAR',
        ...(row.zoneId ? { zoneId: row.zoneId } : {}),
      });
    }
  }
  return items;
}

export function setCell(
  grid: GridState,
  employeeId: string,
  date: string,
  templateId: string,
): GridState {
  return {
    rows: grid.rows.map((r) => {
      if (r.employeeId !== employeeId) return r;
      const cells = { ...r.cells };
      if (templateId) cells[date] = templateId;
      else delete cells[date];
      return { ...r, cells };
    }),
  };
}

export function setZone(grid: GridState, employeeId: string, zoneId: string): GridState {
  return { rows: grid.rows.map((r) => (r.employeeId === employeeId ? { ...r, zoneId } : r)) };
}

export function addRow(grid: GridState, employeeId: string): GridState {
  if (grid.rows.some((r) => r.employeeId === employeeId)) return grid;
  return { rows: [...grid.rows, { employeeId, zoneId: '', cells: {} }] };
}

export function removeRow(grid: GridState, employeeId: string): GridState {
  return { rows: grid.rows.filter((r) => r.employeeId !== employeeId) };
}

export function countShifts(grid: GridState): number {
  return grid.rows.reduce((n, r) => n + Object.values(r.cells).filter(Boolean).length, 0);
}
