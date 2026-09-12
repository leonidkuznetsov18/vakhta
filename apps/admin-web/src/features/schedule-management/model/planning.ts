import { z } from 'zod';
import { canActOn, monthDates, planInstants, type RoleGrant } from '@vakhta/domain';
import type {
  AssignmentInput,
  AssignmentView,
  ScheduleVersionView,
  ShiftTemplateView,
  ZoneView,
} from '@vakhta/contracts';
import {
  addRow,
  applyPattern,
  assignmentChanges,
  gridToItems,
  setAssignment,
  setCell,
  ROTATION_PATTERNS,
  type GridState,
} from './grid';

export const EMPTY_GRID: GridState = { rows: [] };
export const UNASSIGNED_ZONE = '__unassigned__';
export type PeriodMode = 'day' | 'week' | 'month';
export function periodDates(month: string, date: string, mode: PeriodMode): string[] {
  const days = monthDates(month);
  if (mode === 'month') return days;
  const selected = days.includes(date) ? date : days[0];
  if (!selected) return [];
  if (mode === 'day') return [selected];
  const start = new Date(`${selected}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return days.filter(
    (day) => day >= start.toISOString().slice(0, 10) && day <= end.toISOString().slice(0, 10),
  );
}
export function shiftDate(month: string, date: string, offset: number): string {
  const days = monthDates(month);
  const index = Math.max(0, days.indexOf(date));
  return days[Math.max(0, Math.min(days.length - 1, index + offset))] ?? date;
}
export function preferredVersion(
  versions: readonly ScheduleVersionView[],
): ScheduleVersionView | null {
  return (
    versions.find((v) => v.status === 'PUBLISHED') ??
    versions.find((v) => v.status === 'DRAFT') ??
    versions[0] ??
    null
  );
}
export function capabilities(grants: readonly RoleGrant[], siteId: string, orgUnitId: string) {
  const scope = { siteId, orgUnitId };
  return {
    edit: canActOn(grants, ['ADMIN', 'PLANNER'], scope),
    publish: canActOn(grants, ['ADMIN', 'PRODUCTION_HEAD'], scope),
  };
}
export function summarize(
  items: readonly AssignmentInput[],
  templates: readonly ShiftTemplateView[],
  timezone: string,
  recorded: readonly AssignmentView[] = [],
) {
  const byId = new Map(templates.map((template) => [template.id, template]));
  let day = 0;
  let night = 0;
  let minutes: number | null = 0;
  for (const item of items) {
    const template = byId.get(item.templateId);
    if (!template) {
      minutes = null;
      continue;
    }
    if (template.isNight) night++;
    else day++;
    if (minutes !== null) {
      const saved = recorded.find(
        (assignment) =>
          assignment.status === 'PLANNED' &&
          assignment.employeeId === item.employeeId &&
          assignment.businessDate === item.businessDate &&
          assignment.templateId === item.templateId,
      );
      minutes += saved
        ? (Date.parse(saved.planEndAt) - Date.parse(saved.planStartAt)) / 60000
        : planInstants(item.businessDate, template, timezone).durationMinutes;
    }
  }
  return {
    assignments: items.length,
    workers: new Set(items.map((item) => item.employeeId)).size,
    day,
    night,
    minutes,
  };
}
export function zoneRows(grid: GridState, zones: readonly ZoneView[], dates: readonly string[]) {
  const items = gridToItems(grid).filter((item) => dates.includes(item.businessDate));
  const ids = new Set([
    ...zones.filter((zone) => zone.isActive).map((zone) => zone.id),
    ...items.map((item) => item.zoneId ?? UNASSIGNED_ZONE),
  ]);
  return [...ids].map((id) => ({
    id,
    zone: zones.find((zone) => zone.id === id),
    items: items.filter((item) => (item.zoneId ?? UNASSIGNED_ZONE) === id),
  }));
}
export type ZoneRow = ReturnType<typeof zoneRows>[number];

export const batchSchema = z
  .object({
    employeeIds: z.array(z.string().uuid()).min(1),
    zoneId: z.string().uuid(),
    from: z.string().date(),
    to: z.string().date(),
    pattern: z.enum(['SINGLE', ...ROTATION_PATTERNS]),
    templateId: z.string(),
    mode: z.enum(['fill', 'replace']),
  })
  .refine((input) => input.from <= input.to, { path: ['to'] });
export type BatchInput = z.infer<typeof batchSchema>;
export function batchPreview(
  grid: GridState,
  input: BatchInput,
  month: string,
  templates: readonly ShiftTemplateView[],
) {
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success || !input.from.startsWith(month) || !input.to.startsWith(month)) return null;
  const active = templates.filter((template) => template.isActive);
  const day = active.find((template) => !template.isNight)?.id ?? '';
  const night = active.find((template) => template.isNight)?.id ?? '';
  const needsNight = input.pattern.startsWith('NIGHT') || input.pattern === 'DAY_NIGHT_OFF_OFF';
  const needsDay = input.pattern !== 'SINGLE' && !input.pattern.startsWith('NIGHT');
  if (
    (needsDay && !day) ||
    (needsNight && !night) ||
    (input.pattern === 'SINGLE' && !active.some((template) => template.id === input.templateId))
  )
    return null;
  const dates = monthDates(month).filter((date) => date >= input.from && date <= input.to);
  let next = grid;
  for (const employeeId of new Set(input.employeeIds)) {
    const patternGrid =
      input.pattern === 'SINGLE'
        ? null
        : applyPattern(
            addRow(EMPTY_GRID, employeeId),
            employeeId,
            dates,
            input.from,
            input.pattern,
            { day, night },
          );
    for (const businessDate of dates) {
      const row = next.rows.find((candidate) => candidate.employeeId === employeeId);
      if (input.mode === 'fill' && row?.cells[businessDate]) continue;
      const templateId = patternGrid
        ? (patternGrid.rows[0]?.cells[businessDate] ?? '')
        : input.templateId;
      if (!templateId) {
        next = setCell(next, employeeId, businessDate, '');
        continue;
      }
      const previous = gridToItems({ rows: row ? [row] : [] }).find(
        (item) => item.businessDate === businessDate,
      );
      next = setAssignment(next, {
        ...previous,
        employeeId,
        businessDate,
        templateId,
        zoneId: input.zoneId,
        kind: previous?.kind ?? 'REGULAR',
      });
    }
  }
  if (gridToItems(next).length > 5000) return null;
  return { grid: next, changes: assignmentChanges(grid, next) };
}
