import { assignmentAcknowledgement } from '../model/acknowledgement';
import { useState } from 'react';
import {
  PencilIcon,
  MoveIcon,
  UserSearchIcon,
  ActivityIcon,
  InboxIcon,
  Undo2Icon,
} from 'lucide-react';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  ResourceCalendar,
  selectableRow,
  type CalendarSelection,
  type CalendarEmphasis,
} from '@/shared/ui/resource-calendar';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/shared/ui/icon-button';
import { Paginator, usePages } from '@/components/app/data-table';
import { calendarModel, type CalendarGrouping } from '../model/calendar';
import {
  assignmentKey,
  gridFromItems,
  gridToItems,
  sameAssignment,
  setAssignment,
  setCell,
} from '../model/grid';
import type { AdjacentPlan } from '../model/use-adjacent';
import { staffingCoverage } from '../model/use-staffing';
import { planIssues, reasonText, reasonsFor } from '../model/use-eligibility';
import { moveAssignment } from '../model/batch';
import { Feedback } from '@/components/app/feedback';
import { ReasonAlerts } from './reason-alerts';
import { UNASSIGNED_ZONE, zoneAllowed } from '../model/planning';
import type { Workspace } from '../model/use-workspace';
import { AssignmentEditor, type AssignmentContext } from './assignment-editor';
import { SlotDetails } from './slot-details';
import { useOperations } from '../model/use-operations';
import { useCalendarEvents } from '../model/use-events';
import { useNotes } from '../model/use-notes';
import { NotesSection } from './notes-section';
import { useNavigation } from '@/navigation';
import { InfoTip } from '@/components/app/info-tip';
import { recordedTime } from '../lib/labels';
import type { OpenSlots } from '../model/use-open-slots';
import type { CalendarEventsView } from '@vakhta/contracts';
import { employeeLabel } from './assignment-changes';

export function ResourceSchedule({
  workspace: w,
  dates,
  grouping,
  zoneId,
  selectedDate,
  onDate,
  today,
  adjacent,
  slots,
  emphasis = null,
}: {
  readonly workspace: Workspace;
  readonly dates: readonly string[];
  readonly grouping: CalendarGrouping;
  readonly zoneId: string;
  readonly selectedDate: string;
  readonly onDate: (date: string) => void;
  readonly today: string;
  /** Neighbouring months touched by the visible week; displayed, never written. */
  readonly adjacent: AdjacentPlan;
  readonly slots: OpenSlots;
  readonly emphasis?: CalendarEmphasis | null;
}) {
  const t = messages(currentLocale()).scheduleWorkspace;
  const mobile = useIsMobile();
  const navigation = useNavigation();
  const operations = useOperations({
    accessKey: w.accessKey,
    siteId: w.siteId,
    orgUnitId: w.orgUnitId,
    dates,
    enabled: !!w.version,
  });
  const events = useCalendarEvents({
    accessKey: w.accessKey,
    siteId: w.siteId,
    orgUnitId: w.orgUnitId,
    dates,
    enabled: !!w.version,
  });
  const notes = useNotes({
    accessKey: w.accessKey,
    siteId: w.siteId,
    orgUnitId: w.orgUnitId,
    month: w.month,
    enabled: !!w.version,
  });
  const [picked, setPicked] = useState<CalendarSelection | null>(null);
  const [editor, setEditor] = useState<AssignmentContext | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const displayGrid = adjacent.months.length
    ? gridFromItems([...gridToItems(w.grid), ...gridToItems(adjacent.grid)])
    : w.grid;
  const coverage = staffingCoverage({
    staffing: w.staffing,
    grid: displayGrid,
    templates: w.templates,
    timezone: w.timezone,
    dates,
    zoneIds: w.zones.map((zone) => zone.id),
  });
  const model = calendarModel({
    ...w,
    coverage,
    issues: w.issues.reasons,
    grid: adjacent.months.length
      ? gridFromItems([...gridToItems(w.grid), ...gridToItems(adjacent.grid)])
      : w.grid,
    published: adjacent.months.length
      ? gridFromItems([...gridToItems(w.publicationBaseline), ...gridToItems(adjacent.published)])
      : w.publicationBaseline,
    recorded: adjacent.months.length ? [...w.recorded, ...adjacent.recorded] : w.recorded,
    dates,
    grouping,
    zoneId,
    locale: currentLocale(),
    today,
    editableMonth: w.month,
    allowedZones: w.rights.zones,
    slots: slots.slots,
    ...(operations.data ? { operations: operations.data } : {}),
    ...(w.context ? { absences: w.context.absences } : {}),
    ...(events.data ? { events: events.data } : {}),
  });
  const items = gridToItems(w.grid);
  const selectedItem = items.find((item) => assignmentKey(item) === picked?.itemId);
  const selectedSlot = picked?.itemId?.startsWith('slot:')
    ? slots.slots.find((slot) => `slot:${slot.id}` === picked.itemId)
    : undefined;
  const acknowledgement = assignmentAcknowledgement({
    assignment: selectedItem,
    recorded: w.recorded,
    version: w.version,
    timezone: w.timezone,
  });
  const selection =
    selectedItem && picked
      ? {
          ...picked,
          resourceId:
            grouping === 'people'
              ? selectedItem.employeeId
              : (selectedItem.zoneId ?? UNASSIGNED_ZONE),
        }
      : picked;
  const selectedCell = model.resources
    .find((resource) => resource.id === selection?.resourceId)
    ?.cells.find((cell) => cell.date === selection?.date);
  const selectedView = selectedCell?.items.find((item) => item.id === selection?.itemId);
  const pages = usePages(
    selectedCell?.items.length ?? 0,
    10,
    undefined,
    -1,
    `${selection?.resourceId}:${selection?.date}`,
  );
  function select(value: CalendarSelection) {
    setPicked(value);
    setEditor(null);
    onDate(value.date);
  }
  function create(value: CalendarSelection) {
    const availability = model.resources
      .find((resource) => resource.id === value.resourceId)
      ?.cells.find((cell) => cell.date === value.date)?.create;
    if (!w.writable || !availability || availability.disabledReason) return;
    setPicked(value);
    onDate(value.date);
    setEditor({
      employeeId: grouping === 'people' ? value.resourceId : '',
      businessDate: value.date,
      zoneId:
        grouping === 'zones' && value.resourceId !== UNASSIGNED_ZONE ? value.resourceId : zoneId,
    });
  }
  const editable = !!selectedItem && w.writable && zoneAllowed(w.rights.zones, selectedItem.zoneId);
  function edit(move = false) {
    if (!selectedItem || !editable) return;
    setEditor({ ...selectedItem, zoneId: selectedItem.zoneId ?? '', move });
  }
  // The saved version of the selected shift; a local edit differs from it or added the shift.
  const savedItem = selectedItem
    ? gridToItems(w.baseline).find((item) => assignmentKey(item) === assignmentKey(selectedItem))
    : undefined;
  const locallyChanged = !!selectedItem && (!savedItem || !sameAssignment(savedItem, selectedItem));
  function revertSelected() {
    if (!selectedItem || !editable || !locallyChanged) return;
    w.edit(
      savedItem
        ? setAssignment(w.grid, savedItem)
        : setCell(w.grid, selectedItem.employeeId, selectedItem.businessDate, ''),
    );
    setPicked(null);
  }
  const labels = {
    unitName: (id: string) => w.units.find((unit) => unit.id === id)?.name ?? id,
    zoneName: (id: string) => w.zones.find((zone) => zone.id === id)?.name ?? id,
  };
  /** Drag shares the Move command with the editor: invalid targets leave the plan unchanged. */
  function move(
    from: CalendarSelection & { itemId: string },
    to: { resourceId: string; date: string },
  ) {
    if (!w.writable) return;
    const item = items.find((value) => assignmentKey(value) === from.itemId);
    if (!item || !zoneAllowed(w.rights.zones, item.zoneId)) return;
    const target: { employeeId?: string; businessDate: string; zoneId?: string } =
      grouping === 'people'
        ? { employeeId: to.resourceId, businessDate: to.date }
        : {
            businessDate: to.date,
            ...(to.resourceId !== UNASSIGNED_ZONE ? { zoneId: to.resourceId } : {}),
          };
    if (grouping === 'zones' && !zoneAllowed(w.rights.zones, target.zoneId ?? null)) {
      setMoveError(t.zoneScope);
      return;
    }
    const result = moveAssignment(w.grid, item, target, w.month);
    if ('failure' in result) {
      if (result.failure === 'OCCUPIED') setMoveError(t.moveInvalidOccupied);
      else if (result.failure === 'OUTSIDE_MONTH') setMoveError(t.moveInvalidMonth);
      return;
    }
    const issues = planIssues({
      grid: result.grid,
      month: w.month,
      orgUnitId: w.orgUnitId,
      templates: w.templates,
      timezone: w.timezone,
      staffing: w.staffing,
      context: w.context,
    });
    const own = reasonsFor(
      issues.reasons,
      target.employeeId ?? item.employeeId,
      target.businessDate,
    ).filter((reason) => reason.severity === 'BLOCK');
    if (own.length > 0) {
      setMoveError(
        `${t.moveInvalidBlocked} ${own.map((reason) => reasonText(reason, labels)).join(' · ')}`,
      );
      return;
    }
    setMoveError(null);
    setPicked(null);
    w.edit(result.grid);
  }
  return (
    <>
      <Feedback error={moveError} />
      <ResourceCalendar
        model={model}
        layout={mobile ? 'list' : 'grid'}
        selectedDate={selectedDate}
        selection={selection}
        onSelect={select}
        onClearSelection={() => {
          setPicked(null);
          setEditor(null);
        }}
        onCreate={create}
        onDate={(date) => {
          onDate(date);
          setPicked(null);
          setEditor(null);
        }}
        emphasis={emphasis}
        {...(w.writable ? { onMove: move } : {})}
        detail={
          selection && selectedCell ? (
            <div className="space-y-3">
              {editor && w.writable ? (
                <AssignmentEditor
                  key={`${editor.employeeId}:${editor.businessDate}`}
                  workspace={w}
                  context={editor}
                  onClose={() => setEditor(null)}
                  onApplied={() => {
                    setEditor(null);
                    setPicked(null);
                  }}
                  onCreateSlot={(input) =>
                    slots.create.mutate(
                      {
                        siteId: w.siteId,
                        orgUnitId: w.orgUnitId,
                        periodMonth: w.month,
                        ...input,
                      },
                      { onSuccess: () => setEditor(null) },
                    )
                  }
                />
              ) : selectedSlot ? (
                <SlotDetails
                  workspace={w}
                  slot={selectedSlot}
                  slots={slots}
                  onDone={() => setPicked(null)}
                />
              ) : selectedItem ? (
                <>
                  <h3 className="font-semibold break-words">
                    {grouping === 'zones' ? `${employeeLabel(w, selectedItem.employeeId)} · ` : ''}
                    {t.wholeAssignment}
                  </h3>
                  {grouping === 'people' && (
                    <p className="text-sm [overflow-wrap:anywhere]">{selectedView?.title}</p>
                  )}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">{t.detailTime}</dt>
                    <dd className="tabular-nums">{selectedView?.time}</dd>
                    <dt className="text-muted-foreground">{t.kind}</dt>
                    <dd className="[overflow-wrap:anywhere]">{selectedView?.description}</dd>
                    {selectedView?.parts && selectedView.parts.length > 0 && (
                      <>
                        <dt className="text-muted-foreground">{t.segments}</dt>
                        <dd>
                          <ul className="space-y-0.5" aria-label={t.segments}>
                            {selectedView.parts.map((part) => (
                              <li key={part.id}>{part.label}</li>
                            ))}
                          </ul>
                        </dd>
                      </>
                    )}
                    {selectedView?.status && (
                      <>
                        <dt className="text-muted-foreground">{t.detailPublication}</dt>
                        <dd className="[overflow-wrap:anywhere]">{selectedView.status}</dd>
                      </>
                    )}
                    <dt className="text-muted-foreground">{t.detailAcknowledgement}</dt>
                    <dd>{acknowledgement}</dd>
                  </dl>
                  <ReasonAlerts
                    reasons={reasonsFor(
                      w.issues.reasons,
                      selectedItem.employeeId,
                      selectedItem.businessDate,
                    )}
                    labels={labels}
                    label={t.conflict}
                  />
                  <AbsenceContext
                    events={events.data}
                    failed={events.isError}
                    employeeId={selectedItem.employeeId}
                    date={selectedItem.businessDate}
                    timezone={w.timezone}
                  />
                  <OperationalContext
                    workspace={w}
                    item={selectedItem}
                    presence={selectedView?.marker?.label ?? null}
                    query={operations}
                    onOpenRequests={() => navigation.go('requests')}
                    onOpenOperations={() => navigation.go('operations')}
                  />
                  <NotesSection
                    workspace={w}
                    notes={notes}
                    date={selectedItem.businessDate}
                    zoneId={selectedItem.zoneId ?? null}
                    employeeId={selectedItem.employeeId}
                  />
                  <div
                    className="flex flex-wrap items-center gap-2"
                    role="group"
                    aria-label={t.wholeAssignment}
                  >
                    <IconButton
                      icon={PencilIcon}
                      label={t.editAssignment}
                      tooltip={t.editAssignment}
                      size="icon"
                      disabled={!editable}
                      onClick={() => edit()}
                    />
                    <IconButton
                      icon={MoveIcon}
                      label={t.moveAssignment}
                      tooltip={t.moveAssignment}
                      variant="outline"
                      size="icon"
                      className="border-sky-300 text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950"
                      disabled={!editable}
                      onClick={() => edit(true)}
                    />
                    <IconButton
                      icon={UserSearchIcon}
                      label={t.findReplacement}
                      tooltip={t.findReplacement}
                      variant="outline"
                      size="icon"
                      className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950"
                      disabled={!editable}
                      onClick={() => edit(true)}
                    />
                    <IconButton
                      icon={Undo2Icon}
                      label={t.revertAssignment}
                      tooltip={t.revertAssignment}
                      variant="outline"
                      size="icon"
                      className="border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950"
                      disabled={!editable || !locallyChanged}
                      onClick={revertSelected}
                    />
                    {!editable && (
                      <InfoTip
                        text={
                          w.readonlyReason ??
                          (selectedItem && !zoneAllowed(w.rights.zones, selectedItem.zoneId)
                            ? t.zoneScope
                            : t.editBlockedRights)
                        }
                      />
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-semibold">
                    {t.allItems} · {selection.date}
                  </h3>
                  <ul className="divide-y">
                    {selectedCell.items
                      .slice((pages.page - 1) * pages.size, pages.page * pages.size)
                      .map((item) => (
                        <li key={item.id} className="py-2">
                          <Button
                            variant="ghost"
                            className={`h-auto min-h-11 w-full justify-start whitespace-normal text-left ${selectableRow}`}
                            onClick={() => select({ ...selection, itemId: item.id })}
                          >
                            {item.title} · {item.time}
                          </Button>
                        </li>
                      ))}
                  </ul>
                  <Paginator pages={pages} total={selectedCell.items.length} />
                  {selection.date.startsWith(w.month) && (
                    <NotesSection
                      workspace={w}
                      notes={notes}
                      date={selection.date}
                      zoneId={
                        grouping === 'zones' && selection.resourceId !== UNASSIGNED_ZONE
                          ? selection.resourceId
                          : null
                      }
                      employeeId={grouping === 'people' ? selection.resourceId : null}
                    />
                  )}
                </>
              )}
            </div>
          ) : null
        }
      />
    </>
  );
}

/** Presence evidence and requests of one assignment (SC-03/07/13/14/34); decisions stay in Requests. */
function OperationalContext({
  workspace: w,
  item,
  presence,
  query,
  onOpenRequests,
  onOpenOperations,
}: {
  readonly workspace: Workspace;
  readonly item: { readonly employeeId: string; readonly businessDate: string };
  readonly presence: string | null;
  readonly query: ReturnType<typeof useOperations>;
  readonly onOpenRequests: () => void;
  readonly onOpenOperations: () => void;
}) {
  const t = messages(currentLocale()).scheduleWorkspace;
  const catalog = messages(currentLocale()).requests;
  const related = (query.data?.requests ?? []).filter(
    (request) =>
      (request.employeeId === item.employeeId ||
        request.counterpartEmployeeId === item.employeeId) &&
      ((request.periodFrom !== null &&
        request.periodTo !== null &&
        request.periodFrom <= item.businessDate &&
        item.businessDate <= request.periodTo) ||
        request.assignmentDate === item.businessDate),
  );
  const published = w.publicationBaseline.rows.some(
    (row) => row.employeeId === item.employeeId && !!row.cells[item.businessDate],
  );
  const sessionId =
    query.data?.presence.find(
      (row) => row.employeeId === item.employeeId && row.businessDate === item.businessDate,
    )?.sessionId ?? null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-sm">
        <span className="text-muted-foreground">{t.detailPresence}:</span>
        <span>
          {query.isError
            ? t.presenceUnavailable
            : (presence ?? (published && query.isPending ? '…' : t.presenceUnknown))}
        </span>
        <InfoTip text={t.presenceHint} />
      </div>
      {query.data && (
        <p className="text-xs text-muted-foreground">
          {format(t.presenceAsOf, { time: recordedTime(query.data.fetchedAt, w.timezone) })}
        </p>
      )}
      {sessionId && (
        <Button variant="outline" size="sm" onClick={onOpenOperations}>
          <ActivityIcon aria-hidden="true" />
          {t.openShiftRecord}
        </Button>
      )}
      <section className="space-y-1" aria-label={t.requestsContext}>
        <h4 className="text-sm font-semibold">{t.requestsContext}</h4>
        {related.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.noRequestsContext}</p>
        )}
        {related.length > 0 && (
          <ul className="space-y-1 text-sm">
            {related.map((request) => (
              <li key={request.id} className="[overflow-wrap:anywhere]">
                {catalog.types[request.type as keyof typeof catalog.types] ?? request.type} ·{' '}
                {catalog.statuses[request.status as keyof typeof catalog.statuses] ??
                  request.status}
                {request.currentStepKey
                  ? ` · ${format(t.requestStep, {
                      step: request.currentStep + 1,
                      total: request.totalSteps,
                      key: request.currentStepKey,
                    })}`
                  : ''}
                {request.counterpartEmployeeId
                  ? ` · ${employeeLabel(w, request.employeeId)} ⇄ ${employeeLabel(w, request.counterpartEmployeeId)}`
                  : ''}
              </li>
            ))}
          </ul>
        )}
        {related.length > 0 && (
          <Button variant="outline" size="sm" onClick={onOpenRequests}>
            <InboxIcon aria-hidden="true" />
            {t.openRequests}
          </Button>
        )}
      </section>
    </div>
  );
}

/** The person's absence around the shift with the latest sick-leave answer, and their birthday. */
function AbsenceContext({
  events,
  failed,
  employeeId,
  date,
  timezone,
}: {
  readonly events: CalendarEventsView | undefined;
  readonly failed: boolean;
  readonly employeeId: string;
  readonly date: string;
  readonly timezone: string;
}) {
  const t = messages(currentLocale()).scheduleWorkspace;
  if (failed) return <p className="text-sm text-muted-foreground">{t.eventsUnavailable}</p>;
  const absence = events?.absences.find(
    (row) => row.employeeId === employeeId && row.from <= date && date <= row.to,
  );
  const birthday = events?.birthdays.some(
    (row) => row.employeeId === employeeId && row.date === date,
  );
  if (!absence && !birthday) return null;
  const type = absence
    ? absence.type === 'SICK'
      ? t.onSickLeave
      : absence.type === 'VACATION'
        ? t.onVacation
        : t.onDayOff
    : '';
  const answer = (value: 'GOOD' | 'SAME' | 'WORSE') =>
    value === 'GOOD' ? t.checkinGood : value === 'SAME' ? t.checkinSame : t.checkinWorse;
  const replacement = events?.replacements.some(
    (row) => row.employeeId === employeeId && row.businessDate === date,
  );
  return (
    <div className="space-y-1 rounded-md border border-red-200 bg-red-50 p-2 text-sm dark:border-red-900 dark:bg-red-950">
      {absence && (
        <p className="font-medium text-red-800 dark:text-red-200">
          {format(t.absenceRange, { type, from: absence.from, to: absence.to })}
          {absence.status === 'PENDING' ? ` · ${t.absencePendingShort}` : ''}
          {replacement ? ` · ${t.needsReplacement}` : ''}
        </p>
      )}
      {absence?.type === 'SICK' && absence.status === 'APPROVED' && (
        <p className="text-xs text-muted-foreground">
          {absence.lastCheckin
            ? format(t.lastCheckin, {
                date: recordedTime(absence.lastCheckin.answeredAt, timezone),
                answer: answer(absence.lastCheckin.answer),
              })
            : t.noCheckin}
        </p>
      )}
      {birthday && <p className="text-violet-800 dark:text-violet-200">🎂 {t.birthday}</p>}
    </div>
  );
}
