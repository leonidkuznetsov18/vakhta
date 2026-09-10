import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SHIFT_SCOPES,
  type ActiveShiftView,
  type ShiftDetailView,
  type ShiftScope,
  type MasterStartShiftCommand,
} from '@vakhta/contracts';
import { allowedActions, type ShiftState, type UserShiftAction } from '@vakhta/domain';
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
import { formatTime, todayIso } from '@/lib/format';
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
import { EyeIcon, FlagIcon, SendIcon } from 'lucide-react';
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
import { useDeepLinkedId } from '@/lib/route';

const all = messages(currentLocale());
const o = all.admin.operations;
const hints = all.ui.hints;

type StateGroup = keyof typeof o.groups;
const GROUPS: readonly StateGroup[] = [
  'ALL',
  'WORKING',
  'BREAK',
  'MEAL',
  'SERVICE_TIME',
  'DOWNTIME',
  'NOT_STARTED',
  'CLOSED',
];
function groupOf(state: ShiftState): Exclude<StateGroup, 'ALL'> {
  switch (state) {
    case 'BREAK':
    case 'MEAL':
    case 'SERVICE_TIME':
    case 'DOWNTIME':
    case 'NOT_STARTED':
      return state;
    case 'SHIFT_CLOSED':
    case 'EMERGENCY_EXIT':
      return 'CLOSED';
    default:
      return 'WORKING';
  }
}
function rank(row: ActiveShiftView): number {
  if (row.needsClarification) return 0;
  if (row.state === 'DOWNTIME') return 1;
  if (row.state === 'EMERGENCY_EXIT') return 2;
  return 3;
}

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
  const { org } = useOrg();
  const { active: activeEmployees } = useEmployees();
  const [siteId, setSiteId] = usePersistentState('operations.siteId', '');
  const [orgUnitId, setOrgUnitId] = usePersistentState('operations.orgUnitId', '');
  const [scope, setScope] = usePersistentState<ShiftScope>('operations.scope', 'OPEN');
  // The screen always stands on a day, and by default on today: an empty field meant "the live
  // picture", which read as a filter that had not been set rather than as a choice.
  const [date, setDate] = usePersistentState('operations.day', todayIso);
  const [openId, setOpenId] = useDeepLinkedId('operations', 'operations.openId');
  const [startFor, setStartFor] = useState('');
  const [startOpen, setStartOpen] = useState(false);
  const [group, setGroup] = usePersistentState<StateGroup>('operations.group', 'ALL');
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
  const rows = shifts.data ?? [];
  // Any state change anywhere on the floor makes this list stale; the heartbeat keeps the
  // connection alive and the badge honest (spec 9.2).
  const live = useLiveUpdates(shiftsApi.streamUrl(), 'shift', ['shifts']);

  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ['shifts'] });

  const detail =
    useQuery({
      queryKey: keys.shift(openId),
      queryFn: () => shiftsApi.detail(openId!),
      enabled: openId !== null,
    }).data ?? null;

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

  /** The comment as a message to the employee's bot: available on a closed shift too, which is
      exactly when a master needs to ask why the checklist never came. */
  const message = useMutation({
    mutationFn: (v: { row: ActiveShiftView; text: string }) => shiftsApi.message(v.row.id, v.text),
    onSuccess: (_result, v) => {
      notifySuccess(format(o.messageSent, { employee: v.row.fullName }));
      setComment((c) => ({ ...c, [v.row.id]: '' }));
    },
  });

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

  const busy = apply.isPending || message.isPending || ask.isPending || begin.isPending;
  const error =
    readError(apply.error ?? message.error ?? ask.error ?? begin.error ?? shifts.error) ??
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
    if (text.length >= 3) message.mutate({ row, text });
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

  const counts = (() => {
    const c: Record<StateGroup, number> = {
      ALL: rows.length,
      WORKING: 0,
      BREAK: 0,
      MEAL: 0,
      SERVICE_TIME: 0,
      DOWNTIME: 0,
      NOT_STARTED: 0,
      CLOSED: 0,
    };
    for (const row of rows) c[groupOf(row.state)] += 1;
    return c;
  })();
  // Exceptions first: shifts flagged for review, then downtime, then the rest in list order.
  const visibleRows = [
    ...(group === 'ALL' ? rows : rows.filter((row) => groupOf(row.state) === group)),
  ].sort((a, b) => rank(a) - rank(b));

  const columns: Column<ActiveShiftView>[] = [
    {
      key: 'employee',
      header: o.employee,
      cell: (row) => (
        <div>
          <div className="font-medium">{row.fullName}</div>
          <Muted>
            {row.personnelNumber}
            {row.orgUnitName ? ` · ${row.orgUnitName}` : ''}
          </Muted>
        </div>
      ),
    },
    {
      key: 'state',
      header: o.state,
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          <StatusPill tone={STATE_TONE[row.state]}>{all.states[row.state]}</StatusPill>
          {row.resumeState && <Muted>→ {all.states[row.resumeState]}</Muted>}
        </div>
      ),
    },
    {
      key: 'since',
      header: o.since,
      cell: (row) => (
        <span className="tabular-nums">
          {formatTime(row.stateSince)} <Muted>({`${row.stateMinutes} ${o.minutes}`})</Muted>
        </span>
      ),
    },
    {
      key: 'plan',
      header: o.plan,
      cell: (row) => (
        <span className="tabular-nums">
          {row.planStartAt ? `${formatTime(row.planStartAt)}–${formatTime(row.planEndAt)}` : '—'}
        </span>
      ),
    },
    { key: 'zone', header: o.zone, cell: (row) => row.zoneName ?? '—' },
    {
      key: 'presence',
      header: o.presence,
      cell: (row) => <span className="tabular-nums">{formatTime(row.presenceSince)}</span>,
    },
    {
      key: 'flags',
      header: o.flags,
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.needsClarification && <StatusPill tone="danger">{o.needsClarification}</StatusPill>}
          {row.autoCloseReason === 'NO_CHECKLIST' && (
            <StatusPill tone="danger">{o.closedNoChecklist}</StatusPill>
          )}
          {!row.zoneAccepted && row.state === 'PREPARATION' && (
            <StatusPill tone="warning">{o.zoneNotAccepted}</StatusPill>
          )}
        </div>
      ),
    },
  ];

  function renderDetail(row: ActiveShiftView) {
    return (
      /* Clicking the row opens and closes it, so a "close" button inside repeats what the row
         already does. Two columns: what the master can do, and what the shift has done. */
      <div className="grid items-start gap-6 py-1 md:grid-cols-3" data-testid="shift-detail">
        {/* One control under another: the action, then the reason it needs, then the comment, then
            the button. Side by side the four read as unrelated fields on a single line. */}
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
        {detail?.session?.id === row.id ? (
          <DetailPanel detail={detail} className="md:col-span-2" />
        ) : (
          <Muted>{all.ui.common.loading}</Muted>
        )}
      </div>
    );
  }

  const rowActions = (row: ActiveShiftView): RowAction[] => [
    {
      key: 'detail',
      label: o.detail,
      icon: EyeIcon,
      onSelect: () => setOpenId(openId === row.id ? null : row.id),
    },
    ...(!row.needsClarification && row.endedAt === null
      ? [
          {
            key: 'clarify',
            label: o.clarify,
            icon: FlagIcon,
            disabled: busy,
            onSelect: () => void clarify(row),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks guide="operations" />
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
        <SelectField
          label={o.scope}
          value={scope}
          onChange={(v) => setScope((v || 'OPEN') as ShiftScope)}
          hint={hints.operationsScope}
          options={SHIFT_SCOPES.map((s) => ({ value: s, label: o.scopes[s] }))}
          className="w-44"
        />
        {/* A day instead of the live picture: the same list, read from the records of that date. */}
        <DateField
          label={o.date}
          value={date}
          onChange={setDate}
          hint={hints.operationsDate}
          className="w-44"
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
                <SelectField
                  label={o.employee}
                  value={startFor}
                  onChange={setStartFor}
                  placeholder="…"
                  required
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
        value={group}
        onValueChange={(v) => setGroup((v || 'ALL') as StateGroup)}
        className="flex-wrap justify-start"
        aria-label={o.state}
      >
        {GROUPS.filter((g) => g !== 'CLOSED' || scope !== 'OPEN').map((g) => (
          <ToggleGroupItem key={g} value={g} className="gap-1">
            {o.groups[g]}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{counts[g]}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* A failed read is as much a message as a failed action, and the master should not be left
          looking at yesterday's list wondering why nothing moves. */}
      <Feedback error={error} />

      <DataTable
        columns={columns}
        rows={visibleRows}
        loading={!org}
        storageKey="operations"
        onRowClick={(row) => setOpenId(openId === row.id ? null : row.id)}
        rowActions={rowActions}
        rowKey={(row) => row.id}
        empty={o.empty}
        rowClassName={(row) =>
          row.needsClarification || row.autoCloseReason === 'NO_CHECKLIST' ? ROW_DANGER : undefined
        }
        activeKey={openId}
        expanded={(row) => (row.id === openId ? renderDetail(row) : null)}
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
    <div className={cn('grid items-start gap-4 sm:grid-cols-2', className)}>
      <div>
        <h3 className="mb-2 text-sm font-semibold">{o.intervals}</h3>
        <ul className="flex flex-col gap-1 text-sm">
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
        <ul className="flex flex-col gap-1 text-sm">
          {detail.events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-muted px-1 text-xs">{e.type}</code>
              <span className="tabular-nums">{formatTime(e.occurredAt)}</span>
              {e.actorType && <Muted>· {e.actorType}</Muted>}
              {e.comment && <Muted>· {e.comment}</Muted>}
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
