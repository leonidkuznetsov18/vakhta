import { useCommunicationDraft } from '@/features/employee-communications';
import { useOverviewStaffing } from '@/features/overview';
import { QueryFeedback } from '@/components/app/query-feedback';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SHIFT_SCOPES,
  type ActiveShiftView,
  type ShiftDetailView,
  type ShiftScope,
  type MasterStartShiftCommand,
} from '@vakhta/contracts';
import { allowedActions, isTerminal, type ShiftState, type UserShiftAction } from '@vakhta/domain';
import { format, messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/app/confirm-dialog';
import { DataTable, type Column, type RowAction } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { DateField } from '@/components/app/date-picker';
import { InfoTip } from '@/components/app/info-tip';
import {
  LiveBadge,
  Muted,
  ROW_DANGER,
  StatusPill,
  type Tone,
  Toolbar,
} from '@/components/app/page';
import { formatDuration, formatTime, todayIso } from '@/lib/format';
import { shiftsApi } from '../api.ts';
import { readError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { usePersistentState } from '@/lib/ui-store';
import { useLiveUpdates } from '@/lib/live';
import { useEmployees, useOrg } from '@/lib/org';
import { keys } from '@/lib/query';
import { isBlank } from '@/lib/forms';
import { notifySuccess } from '@/lib/toast';
import { cn } from 'cn';
import { EyeIcon, FlagIcon, PlayIcon, SendIcon, UserXIcon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { HowItWorks } from '@/components/app/how-it-works';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  OperationsRowKind,
  STATE_GROUPS,
  StateGroup,
  groupCounts,
  notArrivedApplies,
  operationsRows,
  visibleRows as visibleOf,
  type NotArrivedRow,
  type OperationsRow,
} from './rows.ts';

const all = messages(currentLocale());
const o = all.admin.operations;
const hints = all.ui.hints;

export const STATE_TONE: Record<ShiftState, Tone> = {
  NOT_STARTED: 'neutral',
  PREPARATION: 'neutral',
  WORKING: 'success',
  SERVICE_TIME: 'info',
  BREAK: 'info',
  MEAL: 'info',
  DOWNTIME: 'danger',
  CLEANING: 'neutral',
  HANDOVER: 'neutral',
  READY_TO_CLOSE: 'warning',
  SHIFT_CLOSED: 'neutral',
  EMERGENCY_EXIT: 'danger',
};

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random()}`;
}

/**
 * "Live shift" (spec 9.2): who is on shift and in which state, live updates over SSE,
 * shift master actions with a mandatory comment and the "needs review" flag (FR-COR-01/04).
 */
export function OperationsPage() {
  const communicationDraft = useCommunicationDraft();
  const { org, queryState: orgQuery } = useOrg();
  const {
    active: activeEmployees,
    loaded: employeesLoaded,
    queryState: employeesQuery,
  } = useEmployees();
  const [siteId, setSiteId] = usePersistentState('operations.siteId', '');
  const [orgUnitId, setOrgUnitId] = usePersistentState('operations.orgUnitId', '');
  const [scope, setScope] = usePersistentState<ShiftScope>('operations.scope', 'OPEN');
  // The screen always stands on a day, and by default on today: an empty field meant "the live
  // picture", which read as a filter that had not been set rather than as a choice.
  const [date, setDate] = usePersistentState('operations.day', todayIso);
  const { id } = useParams({ strict: false });
  const openId = id ?? null;
  const navigate = useNavigate();
  const setOpenId = (id: string | null) => {
    void navigate({
      to: '/operations/{-$id}',
      params: { id: id ?? undefined },
      replace: true,
      resetScroll: false,
    });
  };
  const [startFor, setStartFor] = useState('');
  const [startOpen, setStartOpen] = useState(false);
  const [group, setGroup] = usePersistentState<StateGroup>('operations.group', StateGroup.ALL);
  // A missing person has no shift record to put in the address, so their row opens locally.
  const [openAbsent, setOpenAbsent] = useState<string | null>(null);
  const [startComment, setStartComment] = useState('');
  const [startZone, setStartZone] = useState('');
  const [action, setAction] = useState<Record<string, UserShiftAction | ''>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const { confirm, dialog } = useConfirm();

  const units = org?.orgUnits.filter((u) => u.siteId === siteId) ?? [];

  const query = {
    ...(siteId ? { siteId } : {}),
    ...(orgUnitId ? { orgUnitId } : {}),
    ...(scope === 'OPEN' ? {} : { scope }),
    ...(date ? { date } : {}),
  };
  const shifts = useQuery({
    queryKey: keys.shifts(query),
    queryFn: () => shiftsApi.list(query),
  });
  // The overview counts the no-shows from this snapshot; reading the same one keeps both screens
  // naming the same people.
  const staffingQuery = useOverviewStaffing({
    siteId: siteId || null,
    orgUnitId: orgUnitId || null,
  });
  const staffing = staffingQuery.data?.staffing;
  const withAbsent = notArrivedApplies(staffing, date, scope);
  const rows = operationsRows(
    shifts.data ?? [],
    withAbsent ? staffing.notArrivedPeople : [],
    staffingQuery.data?.generatedAt ?? '',
  );
  // Any state change anywhere on the floor makes this list stale; the heartbeat keeps the
  // connection alive and the badge honest (spec 9.2). An arrival also changes who is missing.
  const live = useLiveUpdates(shiftsApi.streamUrl(), 'shift', ['shifts'], [['overview']]);

  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ['shifts'] });

  const detailQuery = useQuery({
    queryKey: keys.shift(openId),
    queryFn: () => shiftsApi.detail(openId!),
    enabled: openId !== null,
  });
  const graceMinutes = staffingQuery.data?.lateGraceMinutes ?? 0;
  const detail = detailQuery.data ?? null;

  /**
   * Only what this shift can actually do next, computed from its own state with the master's
   * override — offering the whole action list produced "this action is not available" on a shift
   * that was simply not there yet.
   */
  function masterActions(row: ActiveShiftView): UserShiftAction[] {
    return allowedActions(
      { state: row.state, resumeState: row.resumeState },
      {
        masterOverride: true,
        presenceConfirmed: true,
        zoneAccepted: true,
        handoverComplete: true,
        // Downtime and the emergency exit need a reason; the form collects it, so they belong in the
        // list. Probing without one would quietly hide the two actions a master needs most.
        reasonCode: 'PROBE',
      },
    ).filter((a) => a !== 'START_SHIFT');
  }

  /** Downtime and the emergency exit are recorded against a reason from the directory, not free text. */
  function reasonKindFor(act: UserShiftAction | '' | undefined): 'DOWNTIME' | 'EMERGENCY' | null {
    if (act === 'START_DOWNTIME') return 'DOWNTIME';
    if (act === 'EMERGENCY_EXIT') return 'EMERGENCY';
    return null;
  }

  function reasonOptions(act: UserShiftAction | '' | undefined) {
    const kind = reasonKindFor(act);
    if (!kind || !org) return [];
    return org.reasonCodes
      .filter((r) => r.kind === kind && r.isActive)
      .map((r) => ({ value: r.code, label: r.label }));
  }

  /**
   * A refused transition is not a failed request: the server answers with the reason, so it is
   * read from the answer rather than thrown, and the list is re-read either way — a refusal
   * usually means the row on screen is out of date.
   */
  const apply = useMutation({
    mutationFn: (v: { row: ActiveShiftView; act: UserShiftAction; text: string; why: string }) =>
      shiftsApi.transition(v.row.id, {
        action: v.act,
        expectedVersion: v.row.version,
        idempotencyKey: newKey(),
        comment: v.text,
        ...(v.why ? { reasonCode: v.why } : {}),
      }),
    onSuccess: async (result, v) => {
      if (result.ok) {
        // Say what happened and to whom: "Дію виконано" left the master guessing which one landed.
        notifySuccess(
          format(o.applied, {
            employee: v.row.fullName,
            action: o.masterActionLabels[v.act],
            state: all.states[result.session.state],
          }),
        );
        setComment((c) => ({ ...c, [v.row.id]: '' }));
        setReason((r) => ({ ...r, [v.row.id]: '' }));
      }
      await refresh();
    },
  });
  const refused = apply.data?.ok === false ? apply.data.error : null;

  const ask = useMutation({
    mutationFn: (v: { row: ActiveShiftView; reason: string }) =>
      shiftsApi.clarify(v.row.id, v.reason),
    onSuccess: async () => {
      notifySuccess(o.clarified);
      await refresh();
    },
  });

  const begin = useMutation({
    mutationFn: (cmd: MasterStartShiftCommand) => shiftsApi.start(cmd),
    onSuccess: async (result) => {
      if (result.ok) {
        notifySuccess(o.started);
        setStartComment('');
        setStartZone('');
        setStartFor('');
        setStartOpen(false);
      }
      await refresh();
    },
  });
  const refusedStart = begin.data?.ok === false ? begin.data.error : null;

  const busy = apply.isPending || ask.isPending || begin.isPending;
  const error =
    readError(apply.error ?? ask.error ?? begin.error) ??
    (refused ? (refused === 'VERSION_CONFLICT' ? o.stale : all.errors[refused]) : null) ??
    (refusedStart ? all.errors[refusedStart] : null);

  function applyAction(row: ActiveShiftView) {
    const act = action[row.id];
    const text = (comment[row.id] ?? '').trim();
    const why = reason[row.id] ?? '';
    if (!act || text.length < 3) return;
    if (reasonKindFor(act) && !why) return;
    apply.mutate({ row, act, text, why });
  }

  function sendMessage(row: ActiveShiftView) {
    const text = (comment[row.id] ?? '').trim();
    communicationDraft.open(
      { id: row.employeeId, fullName: row.fullName, personnelNumber: row.personnelNumber },
      text,
    );
  }

  async function clarify(row: ActiveShiftView) {
    const reason = await confirm({
      title: `${o.clarify}: ${row.fullName}`,
      description: hints.operationsClarify,
      confirmLabel: o.clarify,
      commentLabel: o.comment,
      commentRequired: true,
    });
    if (!reason) return;
    ask.mutate({ row, reason });
  }

  function startShift(ev: FormEvent) {
    ev.preventDefault();
    if (!startFor || startComment.trim().length < 3) return;
    begin.mutate({
      employeeId: startFor,
      idempotencyKey: newKey(),
      comment: startComment.trim(),
      ...(startZone ? { zoneId: startZone } : {}),
    });
  }

  const counts = groupCounts(rows);
  const groups = STATE_GROUPS.filter(
    (g) =>
      (g !== StateGroup.CLOSED || scope !== 'OPEN') && (g !== StateGroup.NOT_ARRIVED || withAbsent),
  );
  // A remembered filter the current day cannot show falls back to everything rather than to nothing.
  const activeGroup = groups.includes(group) ? group : StateGroup.ALL;
  const visibleRows = visibleOf(rows, activeGroup);
  const tableQuery = activeGroup === StateGroup.NOT_ARRIVED ? staffingQuery : shifts;

  /** A count only once its list has arrived: a zero would claim nobody is in that state. */
  function groupLabel(g: StateGroup): string {
    const loaded = shifts.data !== undefined && (g !== StateGroup.NOT_ARRIVED || withAbsent);
    return loaded ? `${o.groups[g]} (${counts[g]})` : o.groups[g];
  }

  function toggleRow(row: OperationsRow) {
    if (row.kind === OperationsRowKind.NOT_ARRIVED) {
      setOpenAbsent(openAbsent === row.key ? null : row.key);
      return;
    }
    setOpenAbsent(null);
    setOpenId(openId === row.key ? null : row.key);
  }

  function openStartFor(row: NotArrivedRow) {
    setStartFor(row.person.employeeId);
    setStartZone('');
    setStartOpen(true);
  }

  function writeTo(row: NotArrivedRow) {
    communicationDraft.open(
      {
        id: row.person.employeeId,
        fullName: row.person.fullName,
        personnelNumber: row.person.personnelNumber,
      },
      '',
    );
  }

  const columns: Column<OperationsRow>[] = [
    {
      key: 'employee',
      sortValue: (row) => employeeOf(row).fullName,
      header: o.employee,
      cell: (row) => {
        const person = employeeOf(row);
        return (
          <div>
            <div className="font-medium">{person.fullName}</div>
            <Muted>
              {person.personnelNumber}
              {person.orgUnitName ? ` · ${person.orgUnitName}` : ''}
            </Muted>
          </div>
        );
      },
    },
    {
      key: 'state',
      sortValue: (row) => stateLabel(row),
      header: o.state,
      cell: (row) => <StateCell row={row} />,
    },
    {
      key: 'since',
      sortValue: (row) => sinceOf(row),
      header: o.since,
      cell: (row) => <SinceCell row={row} />,
    },
    {
      key: 'plan',
      sortValue: (row) => planOf(row).start,
      header: o.plan,
      cell: (row) => {
        const plan = planOf(row);
        return (
          <span className="tabular-nums">
            {plan.start ? `${formatTime(plan.start)}–${formatTime(plan.end)}` : '—'}
          </span>
        );
      },
    },
    { key: 'zone', header: o.zone, cell: (row) => zoneOf(row) ?? '—' },
    {
      key: 'presence',
      sortValue: (row) => presenceOf(row),
      header: o.presence,
      cell: (row) => <span className="tabular-nums">{formatTime(presenceOf(row))}</span>,
    },
    {
      key: 'flags',
      header: o.flags,
      cell: (row) => (row.kind === OperationsRowKind.SHIFT ? <ShiftFlags row={row.shift} /> : null),
    },
  ];

  function renderDetail(row: ActiveShiftView) {
    const readOnly = row.endedAt !== null || isTerminal(row.state);
    return (
      /* Clicking the row opens and closes it, so a "close" button inside repeats what the row
         already does. Read shift evidence before the bounded action form. */
      <div className="flex min-w-0 flex-col gap-6 py-1" data-testid="shift-detail">
        <QueryFeedback query={detailQuery} />
        {detail?.session?.id === row.id && <DetailPanel detail={detail} />}
        {/* One control under another: the action, then the reason it needs, then the comment, then
            the button. Side by side the four read as unrelated fields on a single line. */}
        {!readOnly && (
          <form
            className="flex max-w-2xl flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              // One button, two errands: with an action chosen it makes the transition, without one
              // it sends the comment to the employee. Two buttons over one comment field made the
              // master decide which of them the text belonged to.
              if (action[row.id]) applyAction(row);
              else sendMessage(row);
            }}
          >
            {row.endedAt === null && (
              <SelectField
                label={o.masterAction}
                searchable={false}
                hint={hints.operationsMasterAction}
                value={action[row.id] ?? ''}
                onChange={(v) => {
                  setAction((a) => ({ ...a, [row.id]: v as UserShiftAction }));
                  setReason((r) => ({ ...r, [row.id]: '' }));
                }}
                placeholder="…"
                required
                options={masterActions(row).map((a) => ({
                  value: a,
                  label: o.masterActionLabels[a],
                }))}
              />
            )}
            {/* A reason only appears for the two actions the directory governs; showing it always
              would leave an empty control on every other action, and hiding it when the action
              needs one is what produced "specify a reason" with nowhere to specify it. */}
            {row.endedAt === null && reasonKindFor(action[row.id]) && (
              <SelectField
                label={o.masterReason}
                searchable={false}
                value={reason[row.id] ?? ''}
                onChange={(v) => setReason((r) => ({ ...r, [row.id]: v }))}
                placeholder="…"
                required
                options={reasonOptions(action[row.id])}
              />
            )}
            <FormField label={o.comment} hint={hints.operationsMessage}>
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={comment[row.id] ?? ''}
                  onChange={(e) => setComment((c) => ({ ...c, [row.id]: e.target.value }))}
                  minLength={3}
                  required={row.endedAt === null}
                />
              )}
            </FormField>
            <div>
              <Button
                type="submit"
                variant="success"
                pending={apply.isPending && apply.variables.row.id === row.id}
                disabled={
                  busy ||
                  isBlank(comment[row.id]) ||
                  (reasonKindFor(action[row.id]) !== null && !reason[row.id])
                }
              >
                {action[row.id] ? null : <SendIcon aria-hidden="true" />}
                {o.apply}
              </Button>
            </div>
          </form>
        )}
      </div>
    );
  }

  const shiftActions = (row: ActiveShiftView): RowAction[] => [
    {
      key: 'detail',
      label: o.detail,
      icon: EyeIcon,
      onSelect: () => toggleRow({ kind: OperationsRowKind.SHIFT, key: row.id, shift: row }),
    },
    ...(!row.needsClarification && row.endedAt === null && !isTerminal(row.state)
      ? [
          {
            key: 'clarify',
            label: o.clarify,
            icon: FlagIcon,
            disabled: busy,
            pending: ask.isPending && ask.variables.row.id === row.id,
            onSelect: () => void clarify(row),
          },
        ]
      : []),
  ];

  const notArrivedActions = (row: NotArrivedRow): RowAction[] => [
    { key: 'detail', label: o.detail, icon: EyeIcon, onSelect: () => toggleRow(row) },
    { key: 'start', label: o.start, icon: PlayIcon, onSelect: () => openStartFor(row) },
    { key: 'write', label: o.writeMessage, icon: SendIcon, onSelect: () => writeTo(row) },
  ];

  function rowActions(row: OperationsRow): RowAction[] {
    switch (row.kind) {
      case OperationsRowKind.SHIFT:
        return shiftActions(row.shift);
      case OperationsRowKind.NOT_ARRIVED:
        return notArrivedActions(row);
    }
  }

  function renderNotArrived(row: NotArrivedRow) {
    const plan = `${formatTime(row.person.planStartAt)}–${formatTime(row.person.planEndAt)}`;
    return (
      <div className="flex max-w-2xl flex-col gap-3 py-1" data-testid="not-arrived-detail">
        <p className="text-sm">{format(o.notArrivedDetail, { plan, grace: graceMinutes })}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => openStartFor(row)}>
            <PlayIcon aria-hidden="true" />
            {o.start}
          </Button>
          <Button type="button" variant="outline" onClick={() => writeTo(row)}>
            <SendIcon aria-hidden="true" />
            {o.writeMessage}
          </Button>
        </div>
      </div>
    );
  }

  function expandedRow(row: OperationsRow) {
    switch (row.kind) {
      case OperationsRowKind.SHIFT:
        return row.key === openId ? renderDetail(row.shift) : null;
      case OperationsRowKind.NOT_ARRIVED:
        return row.key === openAbsent ? renderNotArrived(row) : null;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks guide="operations" />
      <QueryFeedback query={orgQuery} />
      <Toolbar>
        <SelectField
          label={o.site}
          value={siteId}
          onChange={(v) => {
            setSiteId(v);
            setOrgUnitId('');
          }}
          placeholder="—"
          options={org?.sites.map((s) => ({ value: s.id, label: s.name })) ?? []}
          className="w-56"
        />
        <SelectField
          label={o.orgUnit}
          value={orgUnitId}
          onChange={setOrgUnitId}
          placeholder="—"
          disabled={!siteId}
          options={units.map((u) => ({ value: u.id, label: u.name }))}
          className="w-56"
        />
        {/* A day instead of the live picture: the same list, read from the records of that date. */}
        <DateField
          label={o.date}
          value={date}
          onChange={setDate}
          hint={hints.operationsDate}
          className="w-44"
        />
        <Button
          type="button"
          variant="outline"
          className="self-end"
          disabled={date === todayIso()}
          onClick={() => setDate(todayIso())}
        >
          {o.today}
        </Button>
        <SelectField
          label={o.scope}
          value={scope}
          onChange={(v) => setScope((v || 'OPEN') as ShiftScope)}
          hint={hints.operationsScope}
          options={SHIFT_SCOPES.map((s) => ({ value: s, label: o.scopes[s] }))}
          className="w-44"
        />
        {/* The state filter named in the toolbar: arriving from another page with a preset (not
            arrived, downtime) must read as a filter, not as a list that lost people. */}
        <SelectField
          label={o.state}
          value={activeGroup}
          onChange={(v) => setGroup((v || StateGroup.ALL) as StateGroup)}
          searchable={false}
          options={groups.map((g) => ({ value: g, label: groupLabel(g) }))}
          className="w-48"
        />
        <div className="ml-auto flex items-center gap-2">
          <Dialog open={startOpen} onOpenChange={setStartOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="secondary">
                {o.startFor}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-1">
                  {o.startFor}
                  <InfoTip text={hints.operationsStartFor} />
                </DialogTitle>
              </DialogHeader>
              <form className="flex flex-col gap-4" onSubmit={startShift}>
                <QueryFeedback query={employeesQuery} />
                <SelectField
                  label={o.employee}
                  value={startFor}
                  onChange={setStartFor}
                  placeholder="…"
                  required
                  disabled={!employeesLoaded}
                  options={activeEmployees.map((e) => ({
                    value: e.id,
                    label: `${e.fullName} · ${e.personnelNumber}`,
                  }))}
                />
                <SelectField
                  label={o.startZone}
                  value={startZone}
                  onChange={setStartZone}
                  placeholder={o.startZoneNone}
                  hint={hints.operationsStartZone}
                  options={
                    org?.zones
                      .filter((z) => z.isActive)
                      .map((z) => ({
                        value: z.id,
                        label: `${z.name} · ${org.orgUnits.find((u) => u.id === z.orgUnitId)?.name ?? ''}`,
                      })) ?? []
                  }
                />
                <FormField label={o.comment}>
                  {(id) => (
                    <Textarea
                      id={id}
                      rows={2}
                      value={startComment}
                      onChange={(e) => setStartComment(e.target.value)}
                      minLength={3}
                      required
                    />
                  )}
                </FormField>
                <Feedback error={error} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setStartOpen(false)}>
                    {all.ui.common.cancel}
                  </Button>
                  <Button
                    type="submit"
                    pending={begin.isPending}
                    disabled={busy || !startFor || startComment.trim().length < 3}
                  >
                    {o.start}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <LiveBadge live={live} hint={hints.operationsLive} />
        </div>
      </Toolbar>

      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={activeGroup}
        onValueChange={(v) => setGroup((v || StateGroup.ALL) as StateGroup)}
        className="flex-wrap justify-start"
        aria-label={o.state}
      >
        {groups.map((g) => (
          <ToggleGroupItem key={g} value={g} className="gap-1">
            {g === StateGroup.NOT_ARRIVED && <UserXIcon aria-hidden="true" />}
            {o.groups[g]}
            {/* No count until the list arrives: a zero would claim nobody is in that state. */}
            {shifts.data !== undefined && (g !== StateGroup.NOT_ARRIVED || withAbsent) && (
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{counts[g]}</span>
            )}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* A failed read is as much a message as a failed action, and the master should not be left
          looking at yesterday's list wondering why nothing moves. */}
      <Feedback error={error} />

      <DataTable
        queryState={tableQuery}
        columns={columns}
        rows={visibleRows}
        loading={orgQuery.isPending && orgQuery.isFetching}
        storageKey="operations"
        rowLabel={(row) => `${employeeOf(row).fullName} · ${employeeOf(row).personnelNumber}`}
        resetKey={`${siteId}:${orgUnitId}:${scope}:${date}:${activeGroup}`}
        searchText={(row) => {
          const person = employeeOf(row);
          return `${person.fullName} ${person.personnelNumber} ${person.orgUnitName ?? ''} ${zoneOf(row) ?? ''} ${stateLabel(row)}`;
        }}
        onRowClick={toggleRow}
        rowActions={rowActions}
        rowKey={(row) => row.key}
        empty={activeGroup === StateGroup.NOT_ARRIVED ? o.notArrivedEmpty : o.empty}
        rowClassName={(row) => (needsAttention(row) ? ROW_DANGER : undefined)}
        activeKey={openAbsent ?? openId}
        expanded={expandedRow}
      />

      {dialog}
    </div>
  );
}

function DetailPanel({
  detail,
  className,
}: {
  readonly detail: ShiftDetailView;
  readonly className?: string;
}) {
  return (
    // Side by side: a full day is twenty intervals and forty events, and one under the other made
    // a column two screens tall out of two lists that each fit in half the width.
    <div className={cn('grid min-w-0 items-start gap-4 md:grid-cols-2', className)}>
      <div>
        <h3 className="mb-2 text-sm font-semibold">{o.intervals}</h3>
        <ul
          tabIndex={0}
          aria-label={o.intervals}
          className="flex max-h-80 flex-col gap-2 overflow-y-auto rounded-md border p-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
        >
          {detail.intervals.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2">
              <StatusPill tone={STATE_TONE[i.state]}>{all.states[i.state]}</StatusPill>
              <span className="tabular-nums">
                {/* An interval still running is said so, not trailed off: an ellipsis reads as a
                    truncated time rather than as "it has not ended yet". */}
                {formatTime(i.startedAt)}–{i.endedAt ? formatTime(i.endedAt) : o.stillOpen}
              </span>
              {i.reasonCode && <Muted>· {i.reasonCode}</Muted>}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">{o.events}</h3>
        <ul
          tabIndex={0}
          aria-label={o.events}
          className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-md border p-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
        >
          {detail.events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-muted px-1 text-xs">{e.type}</code>
              <span className="tabular-nums">{formatTime(e.occurredAt)}</span>
              {e.actorType && <Muted>· {e.actorType}</Muted>}
              {e.comment && <p className="w-full whitespace-pre-wrap">{e.comment}</p>}
            </li>
          ))}
        </ul>
      </div>
      {detail.summary && (
        <div className="sm:col-span-2">
          <h3 className="mb-2 text-sm font-semibold">{o.summary}</h3>
          <p className="text-sm">
            {detail.summary.totalMinutes} {o.minutes} · {all.states.WORKING.toLowerCase()}{' '}
            {detail.summary.workMinutes +
              detail.summary.preparationMinutes +
              detail.summary.serviceMinutes}{' '}
            · {all.states.BREAK.toLowerCase()} {detail.summary.breakMinutes} ·{' '}
            {all.states.MEAL.toLowerCase()} {detail.summary.mealMinutes} ·{' '}
            {all.states.DOWNTIME.toLowerCase()} {detail.summary.downtimeMinutes}
            {detail.summary.overtimePending ? ` · ${all.shift.summaryOvertimePending}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

function employeeOf(row: OperationsRow) {
  switch (row.kind) {
    case OperationsRowKind.SHIFT:
      return row.shift;
    case OperationsRowKind.NOT_ARRIVED:
      return row.person;
  }
}

function stateLabel(row: OperationsRow): string {
  return row.kind === OperationsRowKind.SHIFT ? all.states[row.shift.state] : o.notArrived;
}

function sinceOf(row: OperationsRow): string | null {
  return row.kind === OperationsRowKind.SHIFT ? row.shift.stateSince : row.person.planStartAt;
}

function planOf(row: OperationsRow): { start: string | null; end: string | null } {
  if (row.kind === OperationsRowKind.NOT_ARRIVED)
    return { start: row.person.planStartAt, end: row.person.planEndAt };
  return { start: row.shift.planStartAt, end: row.shift.planEndAt };
}

function zoneOf(row: OperationsRow): string | null {
  return row.kind === OperationsRowKind.SHIFT ? row.shift.zoneName : row.person.zoneName;
}

function presenceOf(row: OperationsRow): string | null {
  return row.kind === OperationsRowKind.SHIFT ? row.shift.presenceSince : null;
}

function needsAttention(row: OperationsRow): boolean {
  if (row.kind === OperationsRowKind.NOT_ARRIVED) return false;
  return row.shift.needsClarification || row.shift.autoCloseReason === 'NO_CHECKLIST';
}

function StateCell({ row }: { readonly row: OperationsRow }) {
  if (row.kind === OperationsRowKind.NOT_ARRIVED)
    return (
      // Orange like a needed replacement on the schedule: a gap to cover, not a stopped line.
      <StatusPill tone="caution" className="gap-1">
        <UserXIcon aria-hidden="true" />
        {o.notArrived}
      </StatusPill>
    );
  return (
    <div className="flex flex-wrap items-center gap-1">
      <StatusPill tone={STATE_TONE[row.shift.state]}>{all.states[row.shift.state]}</StatusPill>
      {row.shift.resumeState && <Muted>→ {all.states[row.shift.resumeState]}</Muted>}
    </div>
  );
}

function SinceCell({ row }: { readonly row: OperationsRow }) {
  if (row.kind === OperationsRowKind.NOT_ARRIVED)
    return (
      <span className="tabular-nums">
        {formatTime(row.person.planStartAt)} <Muted>({formatDuration(row.lateMinutes)})</Muted>
      </span>
    );
  return (
    <span className="tabular-nums">
      {formatTime(row.shift.stateSince)} <Muted>({`${row.shift.stateMinutes} ${o.minutes}`})</Muted>
    </span>
  );
}

function ShiftFlags({ row }: { readonly row: ActiveShiftView }) {
  return (
    <div className="flex flex-wrap gap-1">
      {row.needsClarification && <StatusPill tone="danger">{o.needsClarification}</StatusPill>}
      {row.autoCloseReason && (
        <StatusPill tone="warning">
          {all.shift.estimatedEndLabel}
          <InfoTip text={all.shift.estimatedClosure} />
        </StatusPill>
      )}
      {row.autoCloseReason === 'NO_CHECKLIST' && (
        <StatusPill tone="danger">{o.closedNoChecklist}</StatusPill>
      )}
      {!row.zoneAccepted && row.state === 'PREPARATION' && (
        <StatusPill tone="warning">{o.zoneNotAccepted}</StatusPill>
      )}
    </div>
  );
}
