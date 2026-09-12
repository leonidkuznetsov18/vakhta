import type { AssignmentInput, ScheduleVersionDetail } from '@vakhta/contracts';

/** Editor state: a row per employee, a cell per day, assignment metadata per cell. */
export interface GridRow {
  readonly employeeId: string;
  readonly zoneId: string;
  /** businessDate → templateId */
  readonly cells: Readonly<Record<string, string>>;
  /** Optional for persisted drafts from the legacy editor. */
  readonly details?: Readonly<Record<string, AssignmentInput>>;
}

export interface GridState {
  readonly rows: readonly GridRow[];
}

export function gridFromDetail(detail: ScheduleVersionDetail): GridState {
  return gridFromItems(
    detail.assignments
      .filter((a) => a.status === 'PLANNED')
      .map((a) => ({
        employeeId: a.employeeId,
        businessDate: a.businessDate,
        templateId: a.templateId,
        kind: a.kind,
        ...(a.zoneId ? { zoneId: a.zoneId } : {}),
        ...(a.positionId ? { positionId: a.positionId } : {}),
        ...(a.teamId ? { teamId: a.teamId } : {}),
      })),
  );
}

export function gridFromItems(items: readonly AssignmentInput[]): GridState {
  const rows = new Map<
    string,
    {
      employeeId: string;
      zoneId: string;
      cells: Record<string, string>;
      details: Record<string, AssignmentInput>;
    }
  >();
  for (const item of items) {
    const row = rows.get(item.employeeId) ?? {
      employeeId: item.employeeId,
      zoneId: item.zoneId ?? '',
      cells: {},
      details: {},
    };
    row.cells[item.businessDate] = item.templateId;
    row.details[item.businessDate] = item;
    rows.set(item.employeeId, row);
  }
  return { rows: [...rows.values()] };
}

export function gridToItems(grid: GridState): AssignmentInput[] {
  return grid.rows.flatMap((row) =>
    Object.entries(row.cells).flatMap(([businessDate, templateId]) => {
      if (!templateId) return [];
      return [
        {
          ...(row.details?.[businessDate] ?? {
            kind: 'REGULAR' as const,
            ...(row.zoneId ? { zoneId: row.zoneId } : {}),
          }),
          employeeId: row.employeeId,
          templateId,
          businessDate,
        },
      ];
    }),
  );
}

/** One employee/date remains one assignment even when its zone changes. */
export function setAssignment(grid: GridState, item: AssignmentInput): GridState {
  const next = setCell(
    addRow(grid, item.employeeId),
    item.employeeId,
    item.businessDate,
    item.templateId,
  );
  return {
    rows: next.rows.map((row) =>
      row.employeeId !== item.employeeId
        ? row
        : {
            ...row,
            details: { ...row.details, [item.businessDate]: item },
          },
    ),
  };
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
      const details = { ...r.details };
      if (!templateId) delete details[date];
      else if (details[date]) details[date] = { ...details[date], templateId };
      return { ...r, cells, details };
    }),
  };
}

export function setZone(grid: GridState, employeeId: string, zoneId: string): GridState {
  return {
    rows: grid.rows.map((row) => {
      if (row.employeeId !== employeeId) return row;
      const details = Object.fromEntries(
        gridToItems({ rows: [row] }).map((item) => {
          const { zoneId: _previousZone, ...rest } = item;
          return [item.businessDate, { ...rest, ...(zoneId ? { zoneId } : {}) }];
        }),
      );
      return { ...row, zoneId, details };
    }),
  };
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

/**
 * Shifts that differ between two grids: added, removed, another template, or the same shift under
 * another zone. This is what a revision publishes and what employees are asked to acknowledge.
 */
export interface AssignmentChange {
  readonly key: string;
  readonly type: 'added' | 'removed' | 'changed';
  readonly before?: AssignmentInput;
  readonly after?: AssignmentInput;
}
export function assignmentKey(item: Pick<AssignmentInput, 'employeeId' | 'businessDate'>): string {
  return `${item.employeeId}:${item.businessDate}`;
}
function fingerprint(item: AssignmentInput): string {
  return JSON.stringify([
    item.employeeId,
    item.businessDate,
    item.templateId,
    item.zoneId ?? '',
    item.kind,
    item.positionId ?? '',
    item.teamId ?? '',
  ]);
}
export function assignmentChanges(before: GridState, after: GridState): AssignmentChange[] {
  const prev = new Map(gridToItems(before).map((item) => [assignmentKey(item), item]));
  const next = new Map(gridToItems(after).map((item) => [assignmentKey(item), item]));
  return [...new Set([...prev.keys(), ...next.keys()])].flatMap((key): AssignmentChange[] => {
    const a = prev.get(key);
    const b = next.get(key);
    if (a && b && fingerprint(a) === fingerprint(b)) return [];
    return [
      {
        key,
        type: !a ? 'added' : !b ? 'removed' : 'changed',
        ...(a ? { before: a } : {}),
        ...(b ? { after: b } : {}),
      },
    ];
  });
}
export function countChanges(before: GridState, after: GridState): number {
  return assignmentChanges(before, after).length;
}

export type RotationPattern =
  'DAY_2_2' | 'NIGHT_2_2' | 'DAY_4_2' | 'NIGHT_4_2' | 'DAY_NIGHT_OFF_OFF' | 'WEEKDAYS_DAY';
export const ROTATION_PATTERNS: readonly RotationPattern[] = [
  'DAY_2_2',
  'NIGHT_2_2',
  'DAY_4_2',
  'NIGHT_4_2',
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
    DAY_4_2: [templates.day, templates.day, templates.day, templates.day, '', ''],
    NIGHT_4_2: [templates.night, templates.night, templates.night, templates.night, '', ''],
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

/** Upgrade old row-level drafts against the saved assignment metadata, after explicit review. */
export function restoreLegacyGrid(draft: GridState, baseline: GridState): GridState {
  return {
    rows: draft.rows.map((row) => {
      if (row.details) return row;
      const savedRow = baseline.rows.find((saved) => saved.employeeId === row.employeeId);
      const changedRowZone = !!savedRow && row.zoneId !== savedRow.zoneId;
      const details = Object.fromEntries(
        gridToItems({ rows: [row] }).map((item) => {
          const saved = savedRow?.details?.[item.businessDate];
          const restored = { ...item, ...saved, templateId: item.templateId };
          if (changedRowZone) {
            const { zoneId: _oldZone, ...rest } = restored;
            return [item.businessDate, { ...rest, ...(row.zoneId ? { zoneId: row.zoneId } : {}) }];
          }
          return [item.businessDate, restored];
        }),
      );
      return { ...row, details };
    }),
  };
}

/** A read projection only. Writes must continue from the complete source grid. */
export function gridForZone(grid: GridState, zoneId: string): GridState {
  if (!zoneId) return grid;
  return gridFromItems(gridToItems(grid).filter((item) => item.zoneId === zoneId));
}

export function removeZoneAssignments(
  grid: GridState,
  employeeId: string,
  zoneId: string,
): GridState {
  const selected = gridToItems(grid).filter(
    (item) => item.employeeId === employeeId && item.zoneId === zoneId,
  );
  return selected.reduce(
    (next, item) => setCell(next, item.employeeId, item.businessDate, ''),
    grid,
  );
}
