import { planInstants } from '@vakhta/domain';
import { messages, type Locale } from '@vakhta/i18n';
import type {
  AssignmentInput,
  AssignmentView,
  EmployeeView,
  ShiftTemplateView,
  ZoneView,
} from '@vakhta/contracts';
import type {
  CalendarItem,
  CalendarResource,
  CalendarViewModel,
} from '@/shared/ui/resource-calendar';
import { assignmentKey, gridToItems, type GridState } from './grid';
import { UNASSIGNED_ZONE } from './planning';

export type CalendarGrouping = 'zones' | 'people';
export interface CalendarInput {
  readonly grid: GridState;
  readonly recorded: readonly AssignmentView[];
  readonly employees: readonly EmployeeView[];
  readonly templates: readonly ShiftTemplateView[];
  readonly zones: readonly ZoneView[];
  readonly dates: readonly string[];
  readonly timezone: string;
  readonly locale: Locale;
  readonly grouping: CalendarGrouping;
  readonly zoneId?: string;
  readonly writable: boolean;
  readonly publication: string;
}

/** Business dates are calendar values, never browser-local instants. */
export function calendarDates(date: string, days: number): string[] {
  const start = new Date(`${date}T00:00:00Z`);
  return Array.from({ length: days }, (_, index) => {
    const value = new Date(start);
    value.setUTCDate(value.getUTCDate() + index);
    return value.toISOString().slice(0, 10);
  });
}
export function calendarWeek(date: string): string[] {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return calendarDates(day.toISOString().slice(0, 10), 7);
}
export function siteToday(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function calendarModel(input: CalendarInput): CalendarViewModel {
  const t = messages(input.locale).scheduleWorkspace;
  const allAssignments = gridToItems(input.grid);
  const occupiedDays = new Set(allAssignments.map(assignmentKey));
  const items = allAssignments.filter(
    (item) =>
      input.dates.includes(item.businessDate) &&
      (!input.zoneId || (item.zoneId ?? UNASSIGNED_ZONE) === input.zoneId),
  );
  const employeeMap = new Map(input.employees.map((employee) => [employee.id, employee]));
  const templates = new Map(input.templates.map((template) => [template.id, template]));
  const zones = new Map(input.zones.map((zone) => [zone.id, zone]));
  const saved = new Map(
    input.recorded
      .filter((item) => item.status === 'PLANNED')
      .map((item) => [assignmentKey(item), item]),
  );
  const dateFormat = new Intl.DateTimeFormat(input.locale, {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });
  const dayFormat = new Intl.DateTimeFormat(input.locale, {
    weekday: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
  const timeFormat = new Intl.DateTimeFormat(input.locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: input.timezone,
  });
  const endDateFormat = new Intl.DateTimeFormat(input.locale, {
    day: '2-digit',
    month: '2-digit',
    timeZone: input.timezone,
  });
  const durationFormat = new Intl.NumberFormat(input.locale, {
    style: 'unit',
    unit: 'hour',
    maximumFractionDigits: 2,
  });
  const resourceId = (item: AssignmentInput) =>
    input.grouping === 'zones' ? (item.zoneId ?? UNASSIGNED_ZONE) : item.employeeId;
  const buckets = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const template = templates.get(item.templateId);
    const previous = saved.get(assignmentKey(item));
    const sameTime = previous?.templateId === item.templateId;
    const plan =
      sameTime && previous
        ? { planStartAt: new Date(previous.planStartAt), planEndAt: new Date(previous.planEndAt) }
        : template
          ? planInstants(item.businessDate, template, input.timezone)
          : null;
    const time = plan
      ? `${timeFormat.format(plan.planStartAt)}–${siteToday(input.timezone, plan.planEndAt) !== item.businessDate ? `${endDateFormat.format(plan.planEndAt)} ` : ''}${timeFormat.format(plan.planEndAt)}`
      : t.unknownTemplate;
    const persisted =
      previous &&
      sameTime &&
      (previous.zoneId ?? undefined) === item.zoneId &&
      previous.kind === item.kind &&
      (previous.positionId ?? undefined) === item.positionId &&
      (previous.teamId ?? undefined) === item.teamId;
    const status = persisted ? input.publication : t.localChanges;
    const key = `${resourceId(item)}:${item.businessDate}`;
    const bucket = buckets.get(key) ?? [];
    const durationMinutes = plan
      ? (plan.planEndAt.getTime() - plan.planStartAt.getTime()) / 60000
      : null;
    const duration = durationMinutes === null ? '' : durationFormat.format(durationMinutes / 60);
    bucket.push({
      id: assignmentKey(item),
      title:
        input.grouping === 'zones'
          ? (employeeMap.get(item.employeeId)?.fullName ?? t.unknownEmployee)
          : (zones.get(item.zoneId ?? '')?.name ?? t.noZone),
      time: `${time}${duration ? ` ${duration}` : ''}`,
      description: template ? (template.isNight ? t.nightShift : t.dayShift) : t.unknownShift,
      status,
      tone: template ? (template.isNight ? 'indigo' : 'amber') : 'neutral',
    });
    buckets.set(key, bucket);
  }
  const ids = new Set(
    input.grouping === 'zones'
      ? [
          ...input.zones.filter((zone) => zone.isActive).map((zone) => zone.id),
          ...items.map(resourceId),
        ]
      : [...input.grid.rows.map((row) => row.employeeId)],
  );
  const resources: CalendarResource[] = [...ids]
    .filter((id) => input.grouping !== 'zones' || !input.zoneId || id === input.zoneId)
    .map((id) => ({
      id,
      title:
        input.grouping === 'zones'
          ? (zones.get(id)?.name ?? t.noZone)
          : (employeeMap.get(id)?.fullName ?? t.unknownEmployee),
      description:
        input.grouping === 'zones'
          ? t.coverageUnknown
          : (employeeMap.get(id)?.personnelNumber ?? ''),
      cells: input.dates.map((date) => {
        const values = buckets.get(`${id}:${date}`) ?? [];
        return {
          date,
          label: dateFormat.format(new Date(`${date}T00:00:00Z`)),
          items: values,
          summary: t.resourceItems.replace('{count}', String(values.length)),
          create: input.writable
            ? {
                label: t.add,
                ...(input.grouping === 'zones' && id !== UNASSIGNED_ZONE && !zones.get(id)?.isActive
                  ? { disabledReason: t.inactive }
                  : {}),
                ...(input.grouping === 'people' &&
                occupiedDays.has(assignmentKey({ employeeId: id, businessDate: date }))
                  ? { disabledReason: values.length ? t.occupied : t.outsideZone }
                  : {}),
              }
            : null,
        };
      }),
    }));
  return {
    label: t.calendar,
    resourceLabel: input.grouping === 'zones' ? t.zone : t.workers,
    dates: input.dates.map((id) => ({
      id,
      label: dayFormat.format(new Date(`${id}T00:00:00Z`)),
      shortLabel: id.slice(8),
    })),
    resources,
    emptyLabel: t.noAssignments,
    moreItemsLabel: t.resourceMoreItems,
  };
}
