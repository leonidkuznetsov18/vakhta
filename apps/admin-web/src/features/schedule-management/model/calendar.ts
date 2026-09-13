import { assignmentInstants, type EligibilityReason } from '@vakhta/domain';
import { format, messages, type Locale, type Messages } from '@vakhta/i18n';
import type {
  AbsenceView,
  CalendarEventsView,
  OpenSlotView,
  OperationsView,
  AssignmentInput,
  AssignmentView,
  EmployeeView,
  ShiftTemplateView,
  ZoneView,
} from '@vakhta/contracts';
import type {
  CalendarItem,
  CalendarNote,
  CalendarResource,
  CalendarViewModel,
} from '@/shared/ui/resource-calendar';
import type { CoverageModel } from './use-staffing';
import { assignmentKey, sameAssignment, gridToItems, type GridState } from './grid';
import { UNASSIGNED_ZONE, zoneAllowed } from './planning';

export type CalendarGrouping = 'zones' | 'people';
export interface CalendarInput {
  readonly grid: GridState;
  /** Assignments of the currently published month; an item outside it is not published. */
  readonly published: GridState;
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
  readonly today?: string;
  /** Dates of another month are shown from that month's plan and cannot be edited here. */
  readonly editableMonth?: string;
  /** Zone scope of the editor (D-01); null means every zone of the unit. */
  readonly allowedZones?: ReadonlySet<string> | null;
  /** Staffing coverage of the visible plan; absent while staffing data is loading. */
  readonly coverage?: CoverageModel;
  /** Rule evaluation of the visible plan; blocking reasons mark the card. */
  readonly issues?: readonly EligibilityReason[];
  /** Open slots of the plan (SC-15); rendered in their zone, never counted as people. */
  readonly slots?: readonly OpenSlotView[];
  /** Presence evidence of published assignments (SC-07); absent while loading. */
  readonly operations?: OperationsView;
  /** Absence requests of the plan's people (SC-03); shown per person and date. */
  readonly absences?: readonly AbsenceView[];
  /** Holidays, birthdays, absences with check-ins and replacement needs (calendar events). */
  readonly events?: CalendarEventsView;
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
  const totalsLabel = messages(input.locale).admin.schedule.dayTotals;
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
  const published = new Map(
    gridToItems(input.published).map((item) => [assignmentKey(item), item]),
  );
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
  const monthFormat = new Intl.DateTimeFormat(input.locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const monthLabel = (date: string) =>
    monthFormat.format(new Date(`${date.slice(0, 7)}-01T00:00:00Z`));
  const durationFormat = new Intl.NumberFormat(input.locale, {
    style: 'unit',
    unit: 'hour',
    maximumFractionDigits: 2,
  });
  const resourceId = (item: AssignmentInput) =>
    input.grouping === 'zones' ? (item.zoneId ?? UNASSIGNED_ZONE) : item.employeeId;
  const buckets = new Map<string, CalendarItem[]>();
  const minutesByResource = new Map<string, number | null>();
  const countsByResource = new Map<string, number>();
  const countsByDate = new Map<string, { day: number; night: number }>();
  for (const item of items) {
    const template = templates.get(item.templateId);
    const previous = saved.get(assignmentKey(item));
    const sameTime =
      previous?.templateId === item.templateId &&
      (previous?.customStart ?? null) === (item.customStart ?? null) &&
      (previous?.customEnd ?? null) === (item.customEnd ?? null);
    const plan =
      sameTime && previous
        ? { planStartAt: new Date(previous.planStartAt), planEndAt: new Date(previous.planEndAt) }
        : template
          ? assignmentInstants({ ...item, template }, input.timezone)
          : null;
    const parts = [
      ...(item.segments ?? []).map((segment, index) => ({
        id: `${assignmentKey(item)}:${index}`,
        label: `${segment.localStart}–${segment.localEnd} · ${zones.get(segment.zoneId)?.code ?? zones.get(segment.zoneId)?.name ?? t.noZone}`,
      })),
      ...(item.breaks ?? []).map((pause, index) => ({
        id: `${assignmentKey(item)}:break:${index}`,
        label: [
          format(t.breakPart, { start: pause.localStart, end: pause.localEnd }),
          pause.reliefEmployeeId
            ? format(t.reliefBy, {
                name: employeeMap.get(pause.reliefEmployeeId)?.fullName ?? t.unknownEmployee,
              })
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    ];
    const time = plan
      ? `${timeFormat.format(plan.planStartAt)}–${siteToday(input.timezone, plan.planEndAt) !== item.businessDate ? `${endDateFormat.format(plan.planEndAt)} ` : ''}${timeFormat.format(plan.planEndAt)}`
      : t.unknownTemplate;
    const live = published.get(assignmentKey(item));
    const unpublished = !live || !sameAssignment(live, item);
    const foreign =
      (!!input.editableMonth && !item.businessDate.startsWith(input.editableMonth)) ||
      !zoneAllowed(input.allowedZones ?? null, item.zoneId);
    const own = (input.issues ?? []).filter(
      (reason) =>
        reason.employeeId === item.employeeId && reason.businessDate === item.businessDate,
    );
    const issue = own.some((reason) => reason.severity === 'BLOCK')
      ? 'BLOCK'
      : own.length > 0
        ? 'WARN'
        : undefined;
    const key = `${resourceId(item)}:${item.businessDate}`;
    const bucket = buckets.get(key) ?? [];
    const durationMinutes = plan
      ? (plan.planEndAt.getTime() - plan.planStartAt.getTime()) / 60000
      : null;
    const duration = durationMinutes === null ? '' : durationFormat.format(durationMinutes / 60);
    const owner = resourceId(item);
    const minutes = minutesByResource.get(owner);
    minutesByResource.set(
      owner,
      minutes === null || durationMinutes === null ? null : (minutes ?? 0) + durationMinutes,
    );
    countsByResource.set(owner, (countsByResource.get(owner) ?? 0) + 1);
    const dateCounts = countsByDate.get(item.businessDate) ?? { day: 0, night: 0 };
    if (template?.isNight) dateCounts.night += 1;
    else if (template) dateCounts.day += 1;
    countsByDate.set(item.businessDate, dateCounts);
    const evidence = input.operations?.presence.find(
      (row) => row.employeeId === item.employeeId && row.businessDate === item.businessDate,
    );
    const marker = evidence ? presenceMarker(evidence, timeFormat, t) : undefined;
    const flags = eventFlags(input.events, item.employeeId, item.businessDate, t);
    bucket.push({
      id: assignmentKey(item),
      ...(marker ? { marker } : {}),
      ...(flags.length > 0 ? { flags } : {}),
      title:
        input.grouping === 'zones'
          ? (employeeMap.get(item.employeeId)?.fullName ?? t.unknownEmployee)
          : (zones.get(item.zoneId ?? '')?.name ?? t.noZone),
      time,
      description: [
        template ? (template.isNight ? t.nightShift : t.dayShift) : t.unknownShift,
        duration,
      ]
        .filter(Boolean)
        .join(' · '),
      status: unpublished ? t.notPublished : '',
      unpublished,
      ...(parts.length > 0 ? { parts } : {}),
      ...(foreign ? { readonly: true } : {}),
      ...(issue ? { issue } : {}),
      tone: template ? (template.isNight ? 'indigo' : 'amber') : 'neutral',
    });
    buckets.set(key, bucket);
  }
  if (input.grouping === 'zones')
    for (const slot of input.slots ?? []) {
      if (slot.status !== 'OPEN' && slot.status !== 'OFFERED') continue;
      if (!input.dates.includes(slot.businessDate)) continue;
      if (input.zoneId && slot.zoneId !== input.zoneId) continue;
      const template = templates.get(slot.templateId);
      const plan = template
        ? assignmentInstants({ businessDate: slot.businessDate, template }, input.timezone)
        : null;
      const interested =
        slot.offer?.interests.filter((item) => item.response === 'INTERESTED').length ?? 0;
      const key = `${slot.zoneId}:${slot.businessDate}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push({
        id: `slot:${slot.id}`,
        title: t.openSlot,
        time: plan
          ? `${timeFormat.format(plan.planStartAt)}–${timeFormat.format(plan.planEndAt)}`
          : t.unknownTemplate,
        description: [
          template ? (template.isNight ? t.nightShift : t.dayShift) : t.unknownShift,
          slot.status === 'OFFERED'
            ? format(t.slotOfferedState, { count: interested })
            : t.slotInternal,
        ].join(' · '),
        status: '',
        unpublished: true,
        tone: 'neutral',
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
  const kinds = messages(input.locale).schedule.dayKinds;
  const templateLabel = (templateId: string) =>
    templates.get(templateId)?.isNight ? kinds.NIGHT : kinds.DAY;
  const zoneBadge = (zoneId: string): CalendarNote | undefined => {
    if (input.grouping !== 'zones' || zoneId === UNASSIGNED_ZONE) return undefined;
    if (!input.coverage?.ready) return undefined;
    if (!input.coverage.known.has(zoneId)) return { text: t.coverageUnknown, tone: 'muted' };
    const missing = input.coverage.cells
      .filter((cell) => cell.zoneId === zoneId)
      .reduce((sum, cell) => sum + cell.missing, 0);
    return missing > 0
      ? { text: t.coverageShort.replace('{count}', String(missing)), tone: 'danger' }
      : { text: t.coverageOk, tone: 'ok' };
  };
  const absenceNote = (employeeId: string, date: string): CalendarNote | undefined => {
    const absence = (input.absences ?? []).find(
      (row) => row.employeeId === employeeId && row.from <= date && date <= row.to,
    );
    if (!absence) return undefined;
    const type =
      messages(input.locale).requests.types[absence.type as keyof Messages['requests']['types']] ??
      absence.type;
    return absence.status === 'APPROVED'
      ? { text: format(t.absenceApproved, { type }), tone: 'danger' }
      : { text: format(t.absencePending, { type }), tone: 'muted' };
  };
  const cellNote = (zoneId: string, date: string): CalendarNote | undefined => {
    if (input.grouping === 'people') return absenceNote(zoneId, date);
    if (input.grouping !== 'zones' || !input.coverage?.ready) return undefined;
    const rows = input.coverage.cells.filter(
      (cell) => cell.zoneId === zoneId && cell.businessDate === date,
    );
    if (rows.length === 0) return undefined;
    const byTemplate = new Map<string, { eligible: number; required: number }>();
    for (const row of rows) {
      const current = byTemplate.get(row.templateId) ?? { eligible: 0, required: 0 };
      byTemplate.set(row.templateId, {
        eligible: current.eligible + row.eligible,
        required: current.required + row.required,
      });
    }
    const short = rows.some((row) => row.missing > 0);
    const onBreak = Math.max(...rows.map((row) => row.onBreak));
    return {
      text: [
        ...[...byTemplate].map(
          ([templateId, value]) =>
            `${templateLabel(templateId)} ${value.eligible}/${value.required}`,
        ),
        ...(onBreak > 0 ? [format(t.onBreakShort, { count: onBreak })] : []),
      ].join(' · '),
      tone: short ? 'danger' : 'ok',
    };
  };
  const resources: CalendarResource[] = [...ids]
    .filter((id) => input.grouping !== 'zones' || !input.zoneId || id === input.zoneId)
    .map((id) => {
      const count = countsByResource.get(id) ?? 0;
      const minutes = minutesByResource.get(id);
      const hours =
        count === 0
          ? ''
          : minutes === null || minutes === undefined
            ? ''
            : durationFormat.format(minutes / 60);
      return {
        id,
        title:
          input.grouping === 'zones'
            ? (zones.get(id)?.name ?? t.noZone)
            : (employeeMap.get(id)?.fullName ?? t.unknownEmployee),
        description:
          input.grouping === 'zones'
            ? (zones.get(id)?.code ?? '')
            : (employeeMap.get(id)?.personnelNumber ?? ''),
        ...(zoneBadge(id) ? { badge: zoneBadge(id) } : {}),
        summary: [t.shiftsCount.replace('{count}', String(count)), hours]
          .filter(Boolean)
          .join(' · '),
        cells: input.dates.map((date) => {
          const values = buckets.get(`${id}:${date}`) ?? [];
          const note = cellNote(id, date);
          return {
            date,
            label: dateFormat.format(new Date(`${date}T00:00:00Z`)),
            items: values,
            ...(note ? { note } : {}),
            summary: t.resourceItems.replace('{count}', String(values.length)),
            create: input.writable
              ? {
                  label: t.add,
                  ...(input.editableMonth && !date.startsWith(input.editableMonth)
                    ? { disabledReason: t.otherMonth.replace('{month}', monthLabel(date)) }
                    : {}),
                  ...(input.grouping === 'zones' &&
                  id !== UNASSIGNED_ZONE &&
                  !zones.get(id)?.isActive
                    ? { disabledReason: t.inactive }
                    : {}),
                  ...(input.grouping === 'zones' && !zoneAllowed(input.allowedZones ?? null, id)
                    ? { disabledReason: t.zoneScope }
                    : {}),
                  ...(input.grouping === 'people' &&
                  occupiedDays.has(assignmentKey({ employeeId: id, businessDate: date }))
                    ? { disabledReason: values.length ? t.occupied : t.outsideZone }
                    : {}),
                }
              : null,
          };
        }),
      };
    });
  return {
    label: t.calendar,
    resourceLabel: input.grouping === 'zones' ? t.zone : t.workers,
    dates: input.dates.map((id) => {
      const counts = countsByDate.get(id) ?? { day: 0, night: 0 };
      return {
        id,
        label: dayFormat.format(new Date(`${id}T00:00:00Z`)),
        shortLabel: id.slice(8),
        summary: totalsLabel
          .replace('{day}', String(counts.day))
          .replace('{night}', String(counts.night)),
        today: id === input.today,
        readonly: !!input.editableMonth && !id.startsWith(input.editableMonth),
        ...dateEvents(input.events, id, employeeMap, t),
      };
    }),
    resources,
    emptyLabel: t.noAssignments,
    moreItemsLabel: t.resourceMoreItems,
    issueLabels: { BLOCK: t.conflict, WARN: t.warning },
  };
}

function presenceMarker(
  evidence: OperationsView['presence'][number],
  timeFormat: Intl.DateTimeFormat,
  t: Messages['scheduleWorkspace'],
): { label: string; tone: 'ok' | 'muted' | 'danger' } {
  const at = (value: string | null) => (value ? timeFormat.format(new Date(value)) : '');
  switch (evidence.state) {
    case 'STARTED':
      return { label: format(t.presenceStarted, { time: at(evidence.startedAt) }), tone: 'ok' };
    case 'CLOSED':
      return { label: format(t.presenceClosed, { time: at(evidence.endedAt) }), tone: 'ok' };
    case 'ARRIVED':
      return { label: format(t.presenceArrived, { time: at(evidence.arrivedAt) }), tone: 'ok' };
    case 'NO_EVIDENCE':
      return { label: t.presenceNoEvidence, tone: 'danger' };
    case 'ACKNOWLEDGED':
      return { label: t.presenceAcknowledged, tone: 'muted' };
    default:
      return { label: t.presenceScheduled, tone: 'muted' };
  }
}

function holidayName(code: string, t: Messages['scheduleWorkspace']): string {
  const value = (t as unknown as Record<string, unknown>)[`holiday${code}`];
  return typeof value === 'string' ? value : code;
}

function dateEvents(
  events: CalendarEventsView | undefined,
  date: string,
  employees: ReadonlyMap<string, { readonly fullName: string }>,
  t: Messages['scheduleWorkspace'],
): { holiday?: string; events?: string[]; tone?: 'holiday' | 'absence' | 'birthday' } {
  if (!events) return {};
  const name = (id: string) => employees.get(id)?.fullName ?? t.unknownEmployee;
  const holiday = events.holidays.find((row) => row.date === date);
  const absent = events.absences
    .filter((row) => row.status === 'APPROVED' && row.from <= date && date <= row.to)
    .map(
      (row) =>
        `${row.type === 'SICK' ? '🤒' : row.type === 'VACATION' ? '🏖️' : '🏠'} ${name(row.employeeId)}`,
    );
  const birthdays = events.birthdays
    .filter((row) => row.date === date)
    .map((row) => `🎂 ${name(row.employeeId)}`);
  const lines = [...absent, ...birthdays];
  const tone = holiday
    ? 'holiday'
    : absent.length > 0
      ? 'absence'
      : birthdays.length > 0
        ? 'birthday'
        : undefined;
  return {
    ...(holiday ? { holiday: holidayName(holiday.code, t) } : {}),
    ...(lines.length > 0 ? { events: lines } : {}),
    ...(tone ? { tone } : {}),
  };
}

/** Event chips of one person on one date: sick leave, vacation, day off, replacement needed. */
export function eventFlags(
  events: CalendarEventsView | undefined,
  employeeId: string,
  date: string,
  t: Messages['scheduleWorkspace'],
): { label: string; tone: 'danger' | 'warn' | 'info' }[] {
  if (!events) return [];
  const flags: { label: string; tone: 'danger' | 'warn' | 'info' }[] = [];
  const absence = events.absences.find(
    (row) => row.employeeId === employeeId && row.from <= date && date <= row.to,
  );
  if (absence) {
    const type =
      absence.type === 'SICK'
        ? t.onSickLeave
        : absence.type === 'VACATION'
          ? t.onVacation
          : t.onDayOff;
    const replacement = events.replacements.some(
      (row) => row.employeeId === employeeId && row.businessDate === date,
    );
    flags.push(
      absence.status === 'APPROVED'
        ? { label: replacement ? `${type} · ${t.needsReplacement}` : type, tone: 'danger' }
        : { label: `${type} · ${t.absencePendingShort}`, tone: 'warn' },
    );
  }
  if (events.birthdays.some((row) => row.employeeId === employeeId && row.date === date))
    flags.push({ label: `🎂 ${t.birthday}`, tone: 'info' });
  return flags;
}
