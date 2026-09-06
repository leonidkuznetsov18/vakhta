import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActiveShiftView,
  EmployeeView,
  OrgSnapshot,
  ShiftDetailView,
} from '@vakhta/contracts';
import { SHIFT_ACTIONS, type ShiftAction } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { employeesApi, orgApi, shiftsApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';

const all = messages(currentLocale());
const o = all.admin.operations;

function localTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random()}`;
}

/**
 * «Оперативная смена» (ТЗ 9.2): хто у зміні і в якому стані, живе оновлення через SSE,
 * дії майстра з обовʼязковим коментарем і позначка «потрібна перевірка» (FR-COR-01/04).
 */
export function OperationsPage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [employees, setEmployees] = useState<EmployeeView[]>([]);
  const [siteId, setSiteId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [includeClosed, setIncludeClosed] = useState(false);
  const [rows, setRows] = useState<ActiveShiftView[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShiftDetailView | null>(null);
  const [startFor, setStartFor] = useState('');
  const [startComment, setStartComment] = useState('');
  const [action, setAction] = useState<Record<string, ShiftAction>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const reloadRef = useRef<() => void>(() => undefined);

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

  // SSE: будь-яка зміна стану перечитує список; heartbeat тримає зʼєднання (ТЗ 9.2).
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

  function clarify(row: ActiveShiftView) {
    const reason = window.prompt(o.comment)?.trim();
    if (!reason) return;
    void run(async () => {
      await shiftsApi.clarify(row.id, reason);
      await reload();
    }, o.clarified);
  }

  function startShift(ev: React.FormEvent) {
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

  return (
    <section>
      <div className="toolbar">
        <label>
          <span>{o.site}</span>
          <select
            value={siteId}
            onChange={(e) => {
              setSiteId(e.target.value);
              setOrgUnitId('');
            }}
          >
            <option value="">—</option>
            {org?.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{o.orgUnit}</span>
          <select
            value={orgUnitId}
            onChange={(e) => setOrgUnitId(e.target.value)}
            disabled={!siteId}
          >
            <option value="">—</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={(e) => setIncludeClosed(e.target.checked)}
          />
          <span>{o.includeClosed}</span>
        </label>
        <span className={live ? 'live on' : 'live'} aria-live="polite">
          {live ? o.live : o.offline}
        </span>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="notice">{notice}</p>}

      {rows.length === 0 ? (
        <p className="muted">{o.empty}</p>
      ) : (
        <table className="table ops">
          <thead>
            <tr>
              <th>{o.employee}</th>
              <th>{o.state}</th>
              <th>{o.since}</th>
              <th>{o.plan}</th>
              <th>{o.zone}</th>
              <th>{o.presence}</th>
              <th>{o.flags}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <React.Fragment key={row.id}>
                <tr className={`state-${row.state}${row.needsClarification ? ' flagged' : ''}`}>
                  <td>
                    <div className="emp">{row.fullName}</div>
                    <small className="muted">
                      {row.personnelNumber}
                      {row.orgUnitName ? ` · ${row.orgUnitName}` : ''}
                    </small>
                  </td>
                  <td>
                    <span className={`state-pill ${row.state}`}>{all.states[row.state]}</span>
                    {row.resumeState && (
                      <small className="muted"> → {all.states[row.resumeState]}</small>
                    )}
                  </td>
                  <td>
                    {localTime(row.stateSince)}{' '}
                    <small className="muted">
                      ({row.stateMinutes} {o.minutes})
                    </small>
                  </td>
                  <td>
                    {row.planStartAt
                      ? `${localTime(row.planStartAt)}–${localTime(row.planEndAt)}`
                      : '—'}
                  </td>
                  <td>{row.zoneName ?? '—'}</td>
                  <td>{localTime(row.presenceSince)}</td>
                  <td>
                    {row.needsClarification && <span className="flag">{o.needsClarification}</span>}
                    {!row.zoneAccepted && row.state === 'PREPARATION' && (
                      <span className="flag warn">{o.zoneNotAccepted}</span>
                    )}
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="link"
                      onClick={() => setOpenId(openId === row.id ? null : row.id)}
                    >
                      {o.detail}
                    </button>
                    {!row.needsClarification && row.endedAt === null && (
                      <button
                        type="button"
                        className="link"
                        disabled={busy}
                        onClick={() => clarify(row)}
                      >
                        {o.clarify}
                      </button>
                    )}
                  </td>
                </tr>
                {openId === row.id && (
                  <tr>
                    <td colSpan={8}>
                      <div className="subpanel">
                        {row.endedAt === null && (
                          <form
                            className="inline-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              applyAction(row);
                            }}
                          >
                            <label className="field">
                              <span>{o.masterAction}</span>
                              <select
                                value={action[row.id] ?? ''}
                                onChange={(e) =>
                                  setAction((a) => ({
                                    ...a,
                                    [row.id]: e.target.value as ShiftAction,
                                  }))
                                }
                                required
                              >
                                <option value="">…</option>
                                {SHIFT_ACTIONS.filter((a) => a !== 'START_SHIFT').map((a) => (
                                  <option key={a} value={a}>
                                    {all.actions[a]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="field wide">
                              <span>{o.comment}</span>
                              <input
                                value={comment[row.id] ?? ''}
                                onChange={(e) =>
                                  setComment((c) => ({ ...c, [row.id]: e.target.value }))
                                }
                                minLength={3}
                                required
                              />
                            </label>
                            <button type="submit" className="btn" disabled={busy}>
                              {o.apply}
                            </button>
                          </form>
                        )}
                        {detail && detail.session.id === row.id && <DetailPanel detail={detail} />}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}

      <h2>{o.startFor}</h2>
      <form className="inline-form" onSubmit={startShift}>
        <label className="field">
          <span>{o.employee}</span>
          <select value={startFor} onChange={(e) => setStartFor(e.target.value)} required>
            <option value="">…</option>
            {activeEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName} · {e.personnelNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="field wide">
          <span>{o.comment}</span>
          <input
            value={startComment}
            onChange={(e) => setStartComment(e.target.value)}
            minLength={3}
            required
          />
        </label>
        <button type="submit" className="btn" disabled={busy || !startFor}>
          {o.start}
        </button>
      </form>
    </section>
  );
}

function DetailPanel({ detail }: { readonly detail: ShiftDetailView }) {
  return (
    <div className="detail">
      <div>
        <h3>{o.intervals}</h3>
        <ul className="list">
          {detail.intervals.map((i) => (
            <li key={i.id}>
              <span className={`state-pill ${i.state}`}>{all.states[i.state]}</span>{' '}
              {localTime(i.startedAt)}–{i.endedAt ? localTime(i.endedAt) : '…'}
              {i.reasonCode && <small className="muted"> · {i.reasonCode}</small>}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>{o.events}</h3>
        <ul className="list">
          {detail.events.map((e) => (
            <li key={e.id}>
              <code>{e.type}</code> {localTime(e.occurredAt)}
              {e.actorType && <small className="muted"> · {e.actorType}</small>}
              {e.comment && <small className="muted"> · {e.comment}</small>}
            </li>
          ))}
        </ul>
      </div>
      {detail.summary && (
        <div>
          <h3>{o.summary}</h3>
          <p>
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
