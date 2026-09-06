import type { AssignmentInput, ScheduleVersionDetail } from '@vakhta/contracts';

/** Editor state: a row per employee, a cell per day, a zone per row. */
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

export type RotationPattern = 'DAY_2_2' | 'NIGHT_2_2' | 'DAY_NIGHT_OFF_OFF' | 'WEEKDAYS_DAY';
export const ROTATION_PATTERNS: readonly RotationPattern[] = [
  'DAY_2_2',
  'NIGHT_2_2',
  'DAY_NIGHT_OFF_OFF',
  'WEEKDAYS_DAY',
];

/**
 * Fills an employee row from `startDate` to the end of the month with a rotation. `day` and
 * `night` are template ids; an empty string clears the cell. Days before `startDate` stay.
 */
export function applyPattern(
  grid: GridState,
  employeeId: string,
  dates: readonly string[],
  startDate: string,
  pattern: RotationPattern,
  templates: { readonly day: string; readonly night: string },
): GridState {
  const cycle: readonly string[] = {
    DAY_2_2: [templates.day, templates.day, '', ''],
    NIGHT_2_2: [templates.night, templates.night, '', ''],
    DAY_NIGHT_OFF_OFF: [templates.day, templates.night, '', ''],
    WEEKDAYS_DAY: [],
  }[pattern];
  let next = grid;
  let i = 0;
  for (const date of dates) {
    if (date < startDate) continue;
    let value: string;
    if (pattern === 'WEEKDAYS_DAY') {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      value = weekday === 0 || weekday === 6 ? '' : templates.day;
    } else {
      value = cycle[i % cycle.length] ?? '';
    }
    next = setCell(next, employeeId, date, value);
    i += 1;
  }
  return next;
}

/** Longest run of consecutive planned days in the row, for the "too many in a row" warning. */
export function longestStreak(row: GridRow, dates: readonly string[]): number {
  let best = 0;
  let run = 0;
  for (const date of dates) {
    if (row.cells[date]) {
      run += 1;
      if (run > best) best = run;
    } else run = 0;
  }
  return best;
}
