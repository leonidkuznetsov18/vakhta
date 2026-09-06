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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/app/confirm-dialog';
import { DataTable, type Column, type RowAction } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { LiveBadge, Muted, Section, StatusPill, Toolbar, type Tone } from '@/components/app/page';
import { formatTime } from '@/lib/format';
import { employeesApi, orgApi, shiftsApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { usePersistentState } from '@/lib/persistent-state';

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
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [employees, setEmployees] = useState<EmployeeView[]>([]);
  const [siteId, setSiteId] = usePersistentState('operations.siteId', '');
  const [orgUnitId, setOrgUnitId] = usePersistentState('operations.orgUnitId', '');
  const [includeClosed, setIncludeClosed] = usePersistentState('operations.includeClosed', false);
  const [rows, setRows] = useState<ActiveShiftView[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = usePersistentState<string | null>('operations.openId', null);
  const [detail, setDetail] = useState<ShiftDetailView | null>(null);
  const [startFor, setStartFor] = useState('');
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
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
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
        setNotice(o.applied);
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
        setNotice(o.started);
        setStartComment('');
      }
      await reload();
    });
  }

  const activeEmployees = employees.filter((e) => e.status === 'ACTIVE');

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

  const rowActions = (row: ActiveShiftView): RowAction[] => [
    {
      key: 'detail',
      label: o.detail,
      onSelect: () => setOpenId(openId === row.id ? null : row.id),
    },
    ...(!row.needsClarification && row.endedAt === null
      ? [{ key: 'clarify', label: o.clarify, disabled: busy, onSelect: () => void clarify(row) }]
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
        <div className="ml-auto">
          <LiveBadge live={live} hint={hints.operationsLive} />
        </div>
      </Toolbar>

      <Feedback error={error} notice={notice} />

      <DataTable
        columns={columns}
        rows={rows}
        storageKey="operations"
        onRowClick={(row) => setOpenId(openId === row.id ? null : row.id)}
        rowActions={rowActions}
        rowKey={(row) => row.id}
        empty={o.empty}
        rowClassName={(row) =>
          row.needsClarification ? 'bg-red-50/60 dark:bg-red-950/30' : undefined
        }
        expanded={(row) =>
          openId === row.id ? (
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
                      <Input
                        id={id}
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
          ) : null
        }
      />

      <Section title={o.startFor} hint={hints.operationsStartFor}>
        <form className="flex flex-wrap items-end gap-3" onSubmit={startShift}>
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
            className="w-72"
          />
          <FormField label={o.comment} className="min-w-72 flex-1">
            {(id) => (
              <Input
                id={id}
                value={startComment}
                onChange={(e) => setStartComment(e.target.value)}
                minLength={3}
                required
              />
            )}
          </FormField>
          <Button type="submit" variant="secondary" disabled={busy || !startFor}>
            {o.start}
          </Button>
        </form>
      </Section>
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
