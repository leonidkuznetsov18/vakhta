import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  IncidentDetailView,
  IncidentStatsView,
  IncidentView,
  OrgSnapshot,
} from '@vakhta/contracts';
import { allowedIncidentTransitions, type IncidentStatus } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { incidentsApi, orgApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';

const all = messages(currentLocale());
const i = all.admin.incidents;

function localTime(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '—';
}

function dayStart(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

/** «Простои и инциденты» (ТЗ 9.1): черга майстра з SSE, дії за таблицею переходів, статистика. */
export function IncidentsPage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [siteId, setSiteId] = useState('');
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [rows, setRows] = useState<IncidentView[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IncidentDetailView | null>(null);
  const [target, setTarget] = useState<Record<string, IncidentStatus | ''>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const [duplicateOf, setDuplicateOf] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<IncidentStatsView | null>(null);
  const [from, setFrom] = useState(() =>
    dayStart(new Date(Date.now() - 6 * 86_400_000)).slice(0, 10),
  );
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const reloadRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    orgApi
      .snapshot()
      .then(setOrg)
      .catch((e: unknown) => setError(describeError(e)));
  }, []);

  const reload = useCallback(async () => {
    setRows(await incidentsApi.list({ ...(siteId ? { siteId } : {}), scope }));
  }, [siteId, scope]);

  useEffect(() => {
    reloadRef.current = () => {
      reload().catch((e: unknown) => setError(describeError(e)));
    };
    reloadRef.current();
  }, [reload]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(incidentsApi.streamUrl(), { withCredentials: true });
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener('incident', () => reloadRef.current());
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    let alive = true;
    incidentsApi
      .detail(openId)
      .then((d) => alive && setDetail(d))
      .catch((e: unknown) => alive && setError(describeError(e)));
    return () => {
      alive = false;
    };
  }, [openId, rows]);

  const loadStats = useCallback(() => {
    const toExclusive = new Date(`${to}T00:00:00`);
    toExclusive.setDate(toExclusive.getDate() + 1);
    incidentsApi
      .stats(
        new Date(`${from}T00:00:00`).toISOString(),
        toExclusive.toISOString(),
        siteId || undefined,
      )
      .then(setStats)
      .catch((e: unknown) => setError(describeError(e)));
  }, [from, to, siteId]);

  useEffect(() => {
    loadStats();
  }, [loadStats, rows]);

  function apply(row: IncidentView) {
    const to = target[row.id];
    if (!to) return;
    const text = (comment[row.id] ?? '').trim();
    const dup = duplicateOf[row.id];
    setBusy(true);
    setError(null);
    setNotice(null);
    incidentsApi
      .transition(row.id, {
        to,
        ...(text ? { comment: text } : {}),
        ...(to === 'DUPLICATE' && dup ? { duplicateOfId: dup } : {}),
      })
      .then(async () => {
        setNotice(i.applied);
        setComment((c) => ({ ...c, [row.id]: '' }));
        setTarget((t) => ({ ...t, [row.id]: '' }));
        await reload();
      })
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false));
  }

  const others = (row: IncidentView) =>
    rows.filter((r) => r.id !== row.id && r.status !== 'DUPLICATE');

  return (
    <section>
      <div className="toolbar">
        <label>
          <span>{i.site}</span>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">—</option>
            {org?.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="versions" role="tablist">
          {(['open', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              className={scope === s ? 'active' : undefined}
              onClick={() => setScope(s)}
            >
              {s === 'open' ? i.scopeOpen : i.scopeAll}
            </button>
          ))}
        </div>
        <span className={live ? 'live on' : 'live'}>
          {live ? i.live : all.admin.operations.offline}
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="notice">{notice}</p>}

      {rows.length === 0 ? (
        <p className="muted">{i.empty}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{i.opened}</th>
              <th>{i.severity}</th>
              <th>{i.reason}</th>
              <th>{i.zone}</th>
              <th>{i.reports}</th>
              <th>{i.stoppedNow}</th>
              <th>{i.status}</th>
              <th>{i.sla}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <React.Fragment key={row.id}>
                <tr className={row.slaBreached ? 'flagged' : undefined}>
                  <td>{localTime(row.openedAt)}</td>
                  <td>
                    <span className={`state-pill sev-${row.severity}`}>
                      {all.incidents.severities[row.severity]}
                    </span>
                  </td>
                  <td>
                    {row.reasonLabel}
                    {row.lastComment && <small className="muted"> · {row.lastComment}</small>}
                  </td>
                  <td>{row.zoneName ?? '—'}</td>
                  <td>{row.reportsCount}</td>
                  <td>{row.stoppedNow}</td>
                  <td>
                    <span className={`status-badge ${row.status}`}>
                      {all.incidents.statuses[row.status]}
                    </span>
                  </td>
                  <td>
                    {localTime(row.slaDueAt)}
                    {row.slaBreached && <span className="flag">{i.slaBreached}</span>}
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="link"
                      onClick={() => setOpenId(openId === row.id ? null : row.id)}
                    >
                      {i.detail}
                    </button>
                  </td>
                </tr>
                {openId === row.id && (
                  <tr>
                    <td colSpan={9}>
                      <div className="subpanel">
                        {allowedIncidentTransitions(row.status).length > 0 && (
                          <form
                            className="inline-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              apply(row);
                            }}
                          >
                            <label className="field">
                              <span>{i.status}</span>
                              <select
                                value={target[row.id] ?? ''}
                                onChange={(e) =>
                                  setTarget((t) => ({
                                    ...t,
                                    [row.id]: e.target.value as IncidentStatus,
                                  }))
                                }
                                required
                              >
                                <option value="">…</option>
                                {allowedIncidentTransitions(row.status).map((s) => (
                                  <option key={s} value={s}>
                                    {i.transitions[s]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {target[row.id] === 'DUPLICATE' && (
                              <label className="field">
                                <span>{i.duplicateOf}</span>
                                <select
                                  value={duplicateOf[row.id] ?? ''}
                                  onChange={(e) =>
                                    setDuplicateOf((d) => ({ ...d, [row.id]: e.target.value }))
                                  }
                                  required
                                >
                                  <option value="">…</option>
                                  {others(row).map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {localTime(o.openedAt)} · {o.reasonLabel} ·{' '}
                                      {o.zoneName ?? '—'}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            <label className="field wide">
                              <span>
                                {target[row.id] === 'RESOLVED' || target[row.id] === 'REJECTED'
                                  ? i.commentRequired
                                  : i.comment}
                              </span>
                              <input
                                value={comment[row.id] ?? ''}
                                onChange={(e) =>
                                  setComment((c) => ({ ...c, [row.id]: e.target.value }))
                                }
                                required={
                                  target[row.id] === 'RESOLVED' || target[row.id] === 'REJECTED'
                                }
                                minLength={3}
                              />
                            </label>
                            <button
                              type="submit"
                              className="btn"
                              disabled={busy || !target[row.id]}
                            >
                              {i.apply}
                            </button>
                          </form>
                        )}
                        {detail && detail.incident.id === row.id && (
                          <div className="detail">
                            <div>
                              <h3>{i.reportsTitle}</h3>
                              <ul className="list">
                                {detail.reports.map((r) => (
                                  <li key={r.id}>
                                    {localTime(r.reportedAt)} <strong>{r.fullName}</strong>{' '}
                                    <small className="muted">
                                      {r.stoppedWork ? i.stoppedWork : i.notStopped}
                                      {r.hasPhoto ? ` · ${i.photo}` : ''}
                                      {r.comment ? ` · ${r.comment}` : ''}
                                    </small>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h3>{i.history}</h3>
                              <ul className="list">
                                {detail.history.map((h) => (
                                  <li key={h.id}>
                                    {localTime(h.at)} {all.incidents.statuses[h.toStatus]}
                                    <small className="muted">
                                      {' '}
                                      · {h.actorType}
                                      {h.comment ? ` · ${h.comment}` : ''}
                                    </small>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}

      <h2>{i.stats}</h2>
      <div className="toolbar">
        <label>
          <span>{i.from}</span>
          <input
            type="date"
            value={from}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
          />
        </label>
        <label>
          <span>{i.to}</span>
          <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
      </div>
      {stats && (
        <div className="detail">
          <StatsTable title={i.byReason} rows={stats.byReason} totals={stats.totals} />
          <StatsTable title={i.byZone} rows={stats.byZone} totals={stats.totals} />
        </div>
      )}
    </section>
  );
}

function StatsTable({
  title,
  rows,
  totals,
}: {
  readonly title: string;
  readonly rows: IncidentStatsView['byReason'];
  readonly totals: IncidentStatsView['totals'];
}) {
  return (
    <div>
      <h3>{title}</h3>
      <table className="table">
        <thead>
          <tr>
            <th />
            <th>{i.colIncidents}</th>
            <th>{i.colReports}</th>
            <th>{i.colDowntime}</th>
            <th>{i.colResolution}</th>
            <th>{i.colBreached}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td>{r.incidents}</td>
              <td>{r.reports}</td>
              <td>{r.downtimeMinutes}</td>
              <td>{r.avgResolutionMinutes ?? '—'}</td>
              <td>{r.slaBreached}</td>
            </tr>
          ))}
          <tr className="totals">
            <td>{totals.label}</td>
            <td>{totals.incidents}</td>
            <td>{totals.reports}</td>
            <td>{totals.downtimeMinutes}</td>
            <td>{totals.avgResolutionMinutes ?? '—'}</td>
            <td>{totals.slaBreached}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
