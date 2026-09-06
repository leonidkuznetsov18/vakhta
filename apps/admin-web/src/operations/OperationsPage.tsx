import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  ActiveShiftView,
  EmployeeView,
  OrgSnapshot,
  ShiftDetailView,
} from '@vakhta/contracts';
import { SHIFT_ACTIONS, type ShiftAction, type ShiftState } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/app/confirm-dialog';
import { DataTable, type Column, type RowAction } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { LiveBadge, Muted, StatusPill, Toolbar, type Tone } from '@/components/app/page';
import { formatTime } from '@/lib/format';
import { employeesApi, orgApi, shiftsApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { usePersistentState } from '@/lib/persistent-state';
import { notifySuccess } from '@/lib/toast';
import { EyeIcon, FlagIcon } from 'lucide-react';
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
import { DetailSheet } from '@/components/app/detail-sheet';

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
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [employees, setEmployees] = useState<EmployeeView[]>([]);
  const [siteId, setSiteId] = usePersistentState('operations.siteId', '');
  const [orgUnitId, setOrgUnitId] = usePersistentState('operations.orgUnitId', '');
  const [includeClosed, setIncludeClosed] = usePersistentState('operations.includeClosed', false);
  const [rows, setRows] = useState<ActiveShiftView[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = usePersistentState<string | null>('operations.openId', null);
  const [detail, setDetail] = useState<ShiftDetailView | null>(null);
  const [startFor, setStartFor] = useState('');
  const [startOpen, setStartOpen] = useState(false);
  const [group, setGroup] = usePersistentState<StateGroup>('operations.group', 'ALL');
  const [startComment, setStartComment] = useState('');
  const [action, setAction] = useState<Record<string, ShiftAction | ''>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const reloadRef = useRef<() => void>(() => undefined);
  const { confirm, dialog } = useConfirm();

  const units = useMemo(
    () => org?.orgUnits.filter((u) => u.siteId === siteId) ?? [],
    [org, siteId],
  );

  useEffect(() => {
    let alive = true;
    Promise.all([orgApi.snapshot(), employeesApi.list()])
      .then(([snapshot, list]) => {
        if (!alive) return;
        setOrg(snapshot);
        setEmployees(list);
      })
      .catch((e: unknown) => alive && setError(describeError(e)));
    return () => {
      alive = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const list = await shiftsApi.list({
      ...(siteId ? { siteId } : {}),
      ...(orgUnitId ? { orgUnitId } : {}),
      ...(includeClosed ? { includeClosed: true } : {}),
    });
    setRows(list);
  }, [siteId, orgUnitId, includeClosed]);

  useEffect(() => {
    reloadRef.current = () => {
      reload().catch((e: unknown) => setError(describeError(e)));
    };
    reloadRef.current();
  }, [reload]);

  // SSE: any state change re-reads the list; the heartbeat keeps the connection alive (spec 9.2).
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(shiftsApi.streamUrl(), { withCredentials: true });
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener('shift', () => reloadRef.current());
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    let alive = true;
    shiftsApi
      .detail(openId)
      .then((d) => alive && setDetail(d))
      .catch((e: unknown) => alive && setError(describeError(e)));
    return () => {
      alive = false;
    };
  }, [openId, rows]);

  async function run(fn: () => Promise<void>, done?: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (done) notifySuccess(done);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  function applyAction(row: ActiveShiftView) {
    const act = action[row.id];
    const text = (comment[row.id] ?? '').trim();
    if (!act || text.length < 3) return;
    void run(async () => {
      const result = await shiftsApi.transition(row.id, {
        action: act,
        expectedVersion: row.version,
        idempotencyKey: newKey(),
        comment: text,
      });
      if (!result.ok) {
        setError(result.error === 'VERSION_CONFLICT' ? o.stale : all.errors[result.error]);
      } else {
        notifySuccess(o.applied);
        setComment((c) => ({ ...c, [row.id]: '' }));
      }
      await reload();
    });
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
    void run(async () => {
      await shiftsApi.clarify(row.id, reason);
      await reload();
    }, o.clarified);
  }

  function startShift(ev: FormEvent) {
    ev.preventDefault();
    if (!startFor || startComment.trim().length < 3) return;
    void run(async () => {
      const result = await shiftsApi.start({
        employeeId: startFor,
        idempotencyKey: newKey(),
        comment: startComment.trim(),
      });
      if (!result.ok) setError(all.errors[result.error]);
      else {
        notifySuccess(o.started);
        setStartComment('');
        setStartFor('');
        setStartOpen(false);
      }
      await reload();
    });
  }

  const activeEmployees = employees.filter((e) => e.status === 'ACTIVE');
  const counts = useMemo(() => {
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
  }, [rows]);
  const visibleRows = useMemo(() => {
    const filtered = group === 'ALL' ? rows : rows.filter((row) => groupOf(row.state) === group);
    // Exceptions first: shifts flagged for review, then downtime, then the rest in list order.
    return [...filtered].sort((a, b) => rank(a) - rank(b));
  }, [rows, group]);

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
          {!row.zoneAccepted && row.state === 'PREPARATION' && (
            <StatusPill tone="warning">{o.zoneNotAccepted}</StatusPill>
          )}
        </div>
      ),
    },
  ];

  const openRow = rows.find((r) => r.id === openId) ?? null;

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
        <div className="flex h-8 items-center gap-2">
          <Checkbox
            id="ops-closed"
            checked={includeClosed}
            onCheckedChange={(v) => setIncludeClosed(v === true)}
          />
          <Label htmlFor="ops-closed">{o.includeClosed}</Label>
          <InfoTip text={hints.operationsIncludeClosed} />
        </div>
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
                  <Button type="submit" disabled={busy || !startFor}>
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
        {GROUPS.filter((g) => g !== 'CLOSED' || includeClosed).map((g) => (
          <ToggleGroupItem key={g} value={g} className="gap-1">
            {o.groups[g]}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{counts[g]}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

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
          row.needsClarification ? 'bg-red-50/60 dark:bg-red-950/30' : undefined
        }
        activeKey={openId}
      />
      {openRow && (
        <DetailSheet
          open={openRow !== null}
          onOpenChange={(open) => !open && setOpenId(null)}
          title={
            <>
              {openRow.fullName}
              <StatusPill tone={STATE_TONE[openRow.state]}>{all.states[openRow.state]}</StatusPill>
            </>
          }
          description={`${openRow.personnelNumber}${openRow.orgUnitName ? ` · ${openRow.orgUnitName}` : ''}`}
          wide
        >
          {((row) => (
            <>
              <div className="flex flex-col gap-4">
                {row.endedAt === null && (
                  <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      applyAction(row);
                    }}
                  >
                    <SelectField
                      label={o.masterAction}
                      hint={hints.operationsMasterAction}
                      value={action[row.id] ?? ''}
                      onChange={(v) => setAction((a) => ({ ...a, [row.id]: v as ShiftAction }))}
                      placeholder="…"
                      required
                      options={SHIFT_ACTIONS.filter((a) => a !== 'START_SHIFT').map((a) => ({
                        value: a,
                        label: all.actions[a],
                      }))}
                      className="w-64"
                    />
                    <FormField label={o.comment} className="min-w-72 flex-1">
                      {(id) => (
                        <Textarea
                          id={id}
                          rows={2}
                          value={comment[row.id] ?? ''}
                          onChange={(e) => setComment((c) => ({ ...c, [row.id]: e.target.value }))}
                          minLength={3}
                          required
                        />
                      )}
                    </FormField>
                    <Button type="submit" variant="secondary" disabled={busy}>
                      {o.apply}
                    </Button>
                  </form>
                )}
                {detail && detail.session.id === row.id && <DetailPanel detail={detail} />}
              </div>
            </>
          ))(openRow)}
        </DetailSheet>
      )}

      {dialog}
    </div>
  );
}

function DetailPanel({ detail }: { readonly detail: ShiftDetailView }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold">{o.intervals}</h3>
        <ul className="flex flex-col gap-1 text-sm">
          {detail.intervals.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2">
              <StatusPill tone={STATE_TONE[i.state]}>{all.states[i.state]}</StatusPill>
              <span className="tabular-nums">
                {formatTime(i.startedAt)}–{i.endedAt ? formatTime(i.endedAt) : '…'}
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
        <div className="md:col-span-2">
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
