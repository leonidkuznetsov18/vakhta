import { setUiState } from '@/lib/ui-store';
import {
  PencilIcon,
  MoveIcon,
  UserSearchIcon,
  ActivityIcon,
  InboxIcon,
  Undo2Icon,
  ChevronRightIcon,
  Trash2Icon,
} from 'lucide-react';
import { format, messages, type Messages } from '@vakhta/i18n';
import {
  AbsenceEventStatus,
  type AbsenceEventView,
  type AssignmentInput,
  type CalendarEventsView,
  type OperationsView,
  type WellbeingAnswer,
} from '@vakhta/contracts';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/shared/ui/icon-button';
import { selectableRow, type CalendarItem } from '@/shared/ui/resource-calendar';
import { InfoTip } from '@/components/app/info-tip';
import { QueryFeedback } from '@/components/app/query-feedback';
import { useNavigation } from '@/navigation';
import { recordedTime } from '../lib/labels';
import type { Workspace } from '../model/use-workspace';
import type { AssignmentAbilities } from '../model/assignment-actions';
import type { CalendarGrouping } from '../model/calendar';
import type { useOperations } from '../model/use-operations';
import type { useCalendarEvents } from '../model/use-events';
import type { Notes } from '../model/use-notes';
import { reasonsFor } from '../model/use-eligibility';
import { assignmentAcknowledgement } from '../model/acknowledgement';
import { ReasonAlerts } from './reason-alerts';
import { NotesSection } from './notes-section';
import { employeeLabel } from './assignment-changes';

type WorkspaceText = Messages['scheduleWorkspace'];
const EMPTY_CARD: CalendarItem = {
  id: '',
  title: '',
  time: '',
  description: '',
  status: '',
  tone: 'neutral',
};

/**
 * Read-only details and the actions of one shift, identical in the day, week and month views:
 * time and kind, publication and acknowledgement, rule reasons, absence and presence context,
 * requests, notes, then edit, move, replacement, revert and remove.
 */
export function AssignmentDetails({
  workspace: w,
  item,
  view,
  abilities,
  grouping,
  events,
  operations,
  notes,
  onEdit,
  onRevert,
  onRemove,
}: {
  readonly workspace: Workspace;
  readonly item: AssignmentInput;
  /** The card of the shift as the calendar model prepared it; absent for a hidden shift. */
  readonly view: CalendarItem | undefined;
  readonly abilities: AssignmentAbilities;
  readonly grouping: CalendarGrouping;
  readonly events: ReturnType<typeof useCalendarEvents>;
  readonly operations: ReturnType<typeof useOperations>;
  readonly notes: Notes;
  /** Opens the editor; `move` lets the person change as well as the date and zone. */
  readonly onEdit: (move: boolean) => void;
  readonly onRevert: () => void;
  readonly onRemove: () => void;
}) {
  const t = messages(currentLocale()).scheduleWorkspace;
  const card = view ?? EMPTY_CARD;
  const labels = {
    unitName: (id: string) => w.units.find((unit) => unit.id === id)?.name ?? id,
    zoneName: (id: string) => w.zones.find((zone) => zone.id === id)?.name ?? id,
  };
  const acknowledgement = assignmentAcknowledgement({
    assignment: item,
    recorded: w.recorded,
    version: w.version,
    timezone: w.timezone,
  });
  return (
    <>
      <AssignmentFacts
        card={card}
        grouping={grouping}
        person={employeeLabel(w, item.employeeId)}
        acknowledgement={acknowledgement}
      />
      <ReasonAlerts
        reasons={reasonsFor(w.issues.reasons, item.employeeId, item.businessDate)}
        labels={labels}
        label={t.conflict}
      />
      <AbsenceContext
        events={events.data}
        failed={events.isError}
        employeeId={item.employeeId}
        date={item.businessDate}
        timezone={w.timezone}
      />
      <OperationalContext
        workspace={w}
        item={item}
        presence={card.marker?.label ?? null}
        query={operations}
      />
      <NotesSection
        workspace={w}
        notes={notes}
        date={item.businessDate}
        zoneId={item.zoneId ?? null}
        employeeId={item.employeeId}
      />
      <AssignmentActions
        abilities={abilities}
        blockedReason={blockedReason(abilities, w.readonlyReason, t)}
        onEdit={onEdit}
        onRevert={onRevert}
        onRemove={onRemove}
      />
    </>
  );
}

function blockedReason(
  abilities: AssignmentAbilities,
  readonlyReason: string | null | undefined,
  t: WorkspaceText,
): string {
  if (abilities.terminated) return t.terminatedReadOnly;
  if (readonlyReason) return readonlyReason;
  if (abilities.locked) return t.zoneScope;
  return t.editBlockedRights;
}

function AssignmentFacts({
  card,
  grouping,
  person,
  acknowledgement,
}: {
  readonly card: CalendarItem;
  readonly grouping: CalendarGrouping;
  readonly person: string;
  readonly acknowledgement: string;
}) {
  const t = messages(currentLocale()).scheduleWorkspace;
  const parts = card.parts ?? [];
  const byZones = grouping === 'zones';
  return (
    <>
      <h3 className="font-semibold break-words">
        {byZones ? `${person} · ` : ''}
        {t.wholeAssignment}
      </h3>
      {!byZones && <p className="text-sm [overflow-wrap:anywhere]">{card.title}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t.detailTime}</dt>
        <dd className="tabular-nums">{card.time}</dd>
        <dt className="text-muted-foreground">{t.kind}</dt>
        <dd className="[overflow-wrap:anywhere]">{card.description}</dd>
        {parts.length > 0 && (
          <>
            <dt className="text-muted-foreground">{t.segments}</dt>
            <dd>
              <ul className="space-y-0.5" aria-label={t.segments}>
                {parts.map((part) => (
                  <li key={part.id}>{part.label}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {card.status && (
          <>
            <dt className="text-muted-foreground">{t.detailPublication}</dt>
            <dd className="[overflow-wrap:anywhere]">{card.status}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t.detailAcknowledgement}</dt>
        <dd>{acknowledgement}</dd>
      </dl>
    </>
  );
}

function AssignmentActions({
  abilities,
  blockedReason: reason,
  onEdit,
  onRevert,
  onRemove,
}: {
  readonly abilities: AssignmentAbilities;
  readonly blockedReason: string;
  readonly onEdit: (move: boolean) => void;
  readonly onRevert: () => void;
  readonly onRemove: () => void;
}) {
  const t = messages(currentLocale()).scheduleWorkspace;
  const disabled = !abilities.editable;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.wholeAssignment}>
      {!abilities.terminated && (
        <>
          <IconButton
            icon={PencilIcon}
            label={t.editAssignment}
            tooltip={t.editAssignment}
            size="icon"
            disabled={disabled}
            onClick={() => onEdit(false)}
          />
          <IconButton
            icon={MoveIcon}
            label={t.moveAssignment}
            tooltip={t.moveAssignment}
            variant="outline"
            size="icon"
            className="border-sky-300 text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950"
            disabled={disabled}
            onClick={() => onEdit(true)}
          />
          <IconButton
            icon={UserSearchIcon}
            label={t.findReplacement}
            tooltip={t.findReplacement}
            variant="outline"
            size="icon"
            className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950"
            disabled={disabled}
            onClick={() => onEdit(true)}
          />
          <IconButton
            icon={Undo2Icon}
            label={t.revertAssignment}
            tooltip={t.revertAssignment}
            variant="outline"
            size="icon"
            className="border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950"
            disabled={disabled || !abilities.locallyChanged}
            onClick={onRevert}
          />
        </>
      )}
      {abilities.removable && (
        <Button
          variant="outline"
          className="border-red-300 text-red-800 hover:bg-red-50 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950"
          onClick={onRemove}
        >
          <Trash2Icon aria-hidden />
          {t.removeAssignment}
        </Button>
      )}
      {disabled && <InfoTip text={reason} />}
    </div>
  );
}

/** Presence evidence and requests of one assignment (SC-03/07/13/14/34); decisions stay in Requests. */
function OperationalContext({
  workspace: w,
  item,
  presence,
  query,
}: {
  readonly workspace: Workspace;
  readonly item: { readonly employeeId: string; readonly businessDate: string };
  readonly presence: string | null;
  readonly query: ReturnType<typeof useOperations>;
}) {
  const t = messages(currentLocale()).scheduleWorkspace;
  const navigation = useNavigation();
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
  function openRequests(requestId?: string) {
    if (!requestId) return navigation.go('requests');
    setUiState({ 'requests.scope': 'all' });
    navigation.go('requests', requestId);
  }
  function openOperations(id: string) {
    // The Operations screen lists one day and one scope; point it at this shift's day with
    // every shift visible, then open the record itself.
    setUiState({
      'operations.siteId': w.siteId,
      'operations.orgUnitId': w.orgUnitId,
      'operations.day': item.businessDate,
      'operations.scope': 'ALL',
      'operations.group': 'ALL',
    });
    navigation.go('operations', id);
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-sm">
        <span className="text-muted-foreground">{t.detailPresence}:</span>
        {/* Without evidence yet the value stays blank; QueryFeedback below says why. */}
        <span>{presenceText({ presence, loaded: query.isSuccess, published, t })}</span>
        <InfoTip text={t.presenceHint} />
      </div>
      <QueryFeedback query={query} errorMessage={t.presenceUnavailable} />
      {query.data && (
        <p className="text-xs text-muted-foreground">
          {format(t.presenceAsOf, { time: recordedTime(query.data.fetchedAt, w.timezone) })}
        </p>
      )}
      {sessionId && (
        <Button variant="outline" size="sm" onClick={() => openOperations(sessionId)}>
          <ActivityIcon aria-hidden="true" />
          {t.openShiftRecord}
        </Button>
      )}
      <RelatedRequests
        workspace={w}
        requests={related}
        loaded={query.isSuccess}
        onOpen={openRequests}
      />
    </div>
  );
}

function presenceText(input: {
  readonly presence: string | null;
  readonly loaded: boolean;
  readonly published: boolean;
  readonly t: WorkspaceText;
}): string | null {
  if (input.presence) return input.presence;
  if (input.loaded || !input.published) return input.t.presenceUnknown;
  return null;
}

function RelatedRequests({
  workspace: w,
  requests,
  loaded,
  onOpen,
}: {
  readonly workspace: Workspace;
  readonly requests: readonly OperationsView['requests'][number][];
  readonly loaded: boolean;
  readonly onOpen: (requestId?: string) => void;
}) {
  const t = messages(currentLocale()).scheduleWorkspace;
  return (
    <section className="space-y-1" aria-label={t.requestsContext}>
      <h4 className="text-sm font-semibold">{t.requestsContext}</h4>
      {loaded && requests.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.noRequestsContext}</p>
      )}
      {requests.length > 0 && (
        <ul className="space-y-1 text-sm">
          {requests.map((request) => (
            <li key={request.id}>
              <button
                type="button"
                className={`${selectableRow} flex w-full items-center gap-2 px-2 py-1 text-left [overflow-wrap:anywhere]`}
                onClick={() => onOpen(request.id)}
              >
                <span className="min-w-0 flex-1">{requestLine(w, request)}</span>
                <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {requests.length > 0 && (
        <Button variant="outline" size="sm" onClick={() => onOpen()}>
          <InboxIcon aria-hidden="true" />
          {t.openRequests}
        </Button>
      )}
    </section>
  );
}

/** One line per request: type, status, the current workflow step and both people of a swap. */
function requestLine(w: Workspace, request: OperationsView['requests'][number]): string {
  const t = messages(currentLocale()).scheduleWorkspace;
  const catalog = messages(currentLocale()).requests;
  const types: Record<string, string | undefined> = catalog.types;
  const statuses: Record<string, string | undefined> = catalog.statuses;
  const step = request.currentStepKey
    ? format(t.requestStep, {
        step: request.currentStep + 1,
        total: request.totalSteps,
        key: request.currentStepKey,
      })
    : '';
  const swap = request.counterpartEmployeeId
    ? `${employeeLabel(w, request.employeeId)} ⇄ ${employeeLabel(w, request.counterpartEmployeeId)}`
    : '';
  return [
    types[request.type] ?? request.type,
    statuses[request.status] ?? request.status,
    step,
    swap,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Absence kinds the calendar explains; the check-in line exists for sick leave only. */
interface AbsenceKind {
  readonly label: keyof WorkspaceText;
  readonly checkin: boolean;
}
const DAY_OFF_KIND: AbsenceKind = { label: 'onDayOff', checkin: false };
const ABSENCE_KIND: Record<string, AbsenceKind> = {
  SICK: { label: 'onSickLeave', checkin: true },
  VACATION: { label: 'onVacation', checkin: false },
  DAY_OFF: DAY_OFF_KIND,
};
const CHECKIN_ANSWER: Record<WellbeingAnswer, keyof WorkspaceText> = {
  GOOD: 'checkinGood',
  SAME: 'checkinSame',
  WORSE: 'checkinWorse',
};

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
  if (!events) return null;
  const absence = events.absences.find(
    (row) => row.employeeId === employeeId && row.from <= date && date <= row.to,
  );
  const birthday = events.birthdays.some(
    (row) => row.employeeId === employeeId && row.date === date,
  );
  if (!absence && !birthday) return null;
  const replacement = events.replacements.some(
    (row) => row.employeeId === employeeId && row.businessDate === date,
  );
  return (
    <div className="space-y-1 rounded-md border border-red-200 bg-red-50 p-2 text-sm dark:border-red-900 dark:bg-red-950">
      {absence && <AbsenceLine absence={absence} replacement={replacement} timezone={timezone} />}
      {birthday && <p className="text-violet-800 dark:text-violet-200">🎂 {t.birthday}</p>}
    </div>
  );
}

function AbsenceLine({
  absence,
  replacement,
  timezone,
}: {
  readonly absence: AbsenceEventView;
  readonly replacement: boolean;
  readonly timezone: string;
}) {
  const t = messages(currentLocale()).scheduleWorkspace;
  const kind = ABSENCE_KIND[absence.type] ?? DAY_OFF_KIND;
  const pending = absence.status === AbsenceEventStatus.enum.PENDING;
  const checkin = absence.lastCheckin;
  return (
    <>
      <p className="font-medium text-red-800 dark:text-red-200">
        {format(t.absenceRange, { type: t[kind.label], from: absence.from, to: absence.to })}
        {pending ? ` · ${t.absencePendingShort}` : ''}
        {replacement ? ` · ${t.needsReplacement}` : ''}
      </p>
      {kind.checkin && !pending && (
        <p className="text-xs text-muted-foreground">
          {checkin
            ? format(t.lastCheckin, {
                date: recordedTime(checkin.answeredAt, timezone),
                answer: t[CHECKIN_ANSWER[checkin.answer]],
              })
            : t.noCheckin}
        </p>
      )}
    </>
  );
}
