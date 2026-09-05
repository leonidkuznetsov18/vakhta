import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  OvertimeView,
  RequestDetailView,
  RequestView,
  ShiftDetailView,
} from '@vakhta/contracts';
import { SHIFT_STATES, type ShiftState } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { requestsApi, shiftsApi } from '../api.ts';
import { describeError } from '../errors.ts';

const all = messages('ru');
const r = all.admin.requests;

function localTime(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

function when(req: RequestView): string {
  if (req.periodFrom)
    return req.periodTo && req.periodTo !== req.periodFrom
      ? `${req.periodFrom} – ${req.periodTo}`
      : req.periodFrom;
  if (req.assignmentDate) return req.assignmentDate;
  return '—';
}

/** «Обращения» (ТЗ 9.1): вхідні за роллю, рішення з коментарем, переробка, корекції інтервалів. */
export function RequestsPage() {
  const [scope, setScope] = useState<'inbox' | 'all'>('inbox');
  const [rows, setRows] = useState<RequestView[]>([]);
  const [overtime, setOvertime] = useState<OvertimeView[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RequestDetailView | null>(null);
  const [shift, setShift] = useState<ShiftDetailView | null>(null);
  const [comment, setComment] = useState('');
  const [approvedMinutes, setApprovedMinutes] = useState('');
  const [proposalKind, setProposalKind] = useState<
    'MOVE_BOUNDARY' | 'RECLASSIFY' | 'CLOSE_SHIFT_AT'
  >('CLOSE_SHIFT_AT');
  const [proposalInterval, setProposalInterval] = useState('');
  const [proposalTime, setProposalTime] = useState('');
  const [proposalState, setProposalState] = useState<ShiftState>('WORKING');
  const [overtimeComment, setOvertimeComment] = useState<Record<string, string>>({});
  const reloadRef = useRef<() => void>(() => undefined);

  const reload = useCallback(async () => {
    const [list, ot] = await Promise.all([
      requestsApi.list({ scope }),
      requestsApi.overtime('pending'),
    ]);
    setRows(list);
    setOvertime(ot);
  }, [scope]);

  useEffect(() => {
    reloadRef.current = () => {
      reload().catch((e: unknown) => setError(describeError(e)));
    };
    reloadRef.current();
  }, [reload]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(requestsApi.streamUrl(), { withCredentials: true });
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener('request', () => reloadRef.current());
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      setShift(null);
      return;
    }
    let alive = true;
    requestsApi
      .detail(openId)
      .then(async (d) => {
        if (!alive) return;
        setDetail(d);
        if (d.request.type === 'CORRECTION' && d.request.shiftSessionId) {
          const s = await shiftsApi.detail(d.request.shiftSessionId);
          if (alive) setShift(s);
        } else setShift(null);
      })
      .catch((e: unknown) => alive && setError(describeError(e)));
    return () => {
      alive = false;
    };
  }, [openId, rows]);

  function buildProposal() {
    if (proposalKind === 'CLOSE_SHIFT_AT')
      return proposalTime
        ? { kind: 'CLOSE_SHIFT_AT' as const, endedAt: new Date(proposalTime).toISOString() }
        : undefined;
    if (proposalKind === 'MOVE_BOUNDARY')
      return proposalInterval && proposalTime
        ? {
            kind: 'MOVE_BOUNDARY' as const,
            intervalId: proposalInterval,
            newStartedAt: new Date(proposalTime).toISOString(),
          }
        : undefined;
    return proposalInterval
      ? { kind: 'RECLASSIFY' as const, intervalId: proposalInterval, newState: proposalState }
      : undefined;
  }

  function decide(req: RequestView, decision: 'APPROVED' | 'REJECTED') {
    const text = comment.trim();
    if (text.length < 3) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const proposal =
      decision === 'APPROVED' && req.type === 'CORRECTION' ? buildProposal() : undefined;
    requestsApi
      .decide(req.id, {
        decision,
        comment: text,
        ...(approvedMinutes && (req.type === 'LATE' || req.type === 'EARLY_LEAVE')
          ? { approvedMinutes: Number(approvedMinutes) }
          : {}),
        ...(proposal ? { proposal } : {}),
      })
      .then(async () => {
        setNotice(r.decided);
        setComment('');
        setApprovedMinutes('');
        await reload();
      })
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false));
  }

  function decideOvertime(row: OvertimeView, decision: 'APPROVED' | 'REJECTED') {
    const text = (overtimeComment[row.shiftSessionId] ?? '').trim();
    if (text.length < 3) return;
    setBusy(true);
    setError(null);
    requestsApi
      .decideOvertime(row.shiftSessionId, { decision, comment: text })
      .then(async () => {
        setNotice(r.decided);
        await reload();
      })
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false));
  }

  return (
    <section>
      <div className="toolbar">
        <div className="versions" role="tablist">
          {(['inbox', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              className={scope === s ? 'active' : undefined}
              onClick={() => setScope(s)}
            >
              {s === 'inbox' ? r.scopeInbox : r.scopeAll}
            </button>
          ))}
        </div>
        <span className={live ? 'live on' : 'live'}>
          {live ? r.live : all.admin.operations.offline}
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="notice">{notice}</p>}

      {rows.length === 0 ? (
        <p className="muted">{r.empty}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{r.submitted}</th>
              <th>{r.type}</th>
              <th>{r.employee}</th>
              <th>{r.period}</th>
              <th>{r.status}</th>
              <th>{r.step}</th>
              <th>{r.deadline}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((req) => (
              <React.Fragment key={req.id}>
                <tr className={req.overdue ? 'flagged' : undefined}>
                  <td>{localTime(req.submittedAt)}</td>
                  <td>{all.requests.types[req.type]}</td>
                  <td>
                    {req.employeeName}
                    {req.counterpartName ? (
                      <small className="muted"> ↔ {req.counterpartName}</small>
                    ) : null}
                  </td>
                  <td>
                    {when(req)}
                    {req.minutes !== null ? (
                      <small className="muted"> · {req.minutes} мин</small>
                    ) : null}
                  </td>
                  <td>
                    <span className={`status-badge ${req.status}`}>
                      {all.requests.statuses[req.status]}
                    </span>
                  </td>
                  <td>
                    {req.currentStepKey
                      ? `${req.currentStep + 1}/${req.totalSteps} · ${req.currentStepKey}`
                      : '—'}
                  </td>
                  <td>
                    {localTime(req.stepDeadlineAt)}
                    {req.overdue && <span className="flag">{r.overdue}</span>}
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="link"
                      onClick={() => setOpenId(openId === req.id ? null : req.id)}
                    >
                      {r.detail}
                    </button>
                  </td>
                </tr>
                {openId === req.id && detail && detail.request.id === req.id && (
                  <tr>
                    <td colSpan={8}>
                      <div className="subpanel">
                        {req.comment && <p>{req.comment}</p>}
                        {req.hasMedicalDocument && <MedicalLink request={detail.request} />}
                        {req.currentStepKey && (
                          <form
                            className="inline-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              decide(req, 'APPROVED');
                            }}
                          >
                            {(req.type === 'LATE' || req.type === 'EARLY_LEAVE') && (
                              <label className="field">
                                <span>{r.approvedMinutes}</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={720}
                                  value={approvedMinutes}
                                  onChange={(e) => setApprovedMinutes(e.target.value)}
                                />
                              </label>
                            )}
                            {req.type === 'CORRECTION' && shift && (
                              <>
                                <label className="field">
                                  <span>{r.proposalKind}</span>
                                  <select
                                    value={proposalKind}
                                    onChange={(e) =>
                                      setProposalKind(e.target.value as typeof proposalKind)
                                    }
                                  >
                                    <option value="CLOSE_SHIFT_AT">CLOSE_SHIFT_AT</option>
                                    <option value="MOVE_BOUNDARY">MOVE_BOUNDARY</option>
                                    <option value="RECLASSIFY">RECLASSIFY</option>
                                  </select>
                                </label>
                                {proposalKind !== 'CLOSE_SHIFT_AT' && (
                                  <label className="field">
                                    <span>{r.proposalInterval}</span>
                                    <select
                                      value={proposalInterval}
                                      onChange={(e) => setProposalInterval(e.target.value)}
                                      required
                                    >
                                      <option value="">…</option>
                                      {shift.intervals.map((i) => (
                                        <option key={i.id} value={i.id}>
                                          {all.states[i.state]} {localTime(i.startedAt)} –{' '}
                                          {i.endedAt ? localTime(i.endedAt) : '…'}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                )}
                                {proposalKind !== 'RECLASSIFY' && (
                                  <label className="field">
                                    <span>{r.proposalTime}</span>
                                    <input
                                      type="datetime-local"
                                      value={proposalTime}
                                      onChange={(e) => setProposalTime(e.target.value)}
                                      required
                                    />
                                  </label>
                                )}
                                {proposalKind === 'RECLASSIFY' && (
                                  <label className="field">
                                    <span>{r.proposalState}</span>
                                    <select
                                      value={proposalState}
                                      onChange={(e) =>
                                        setProposalState(e.target.value as ShiftState)
                                      }
                                    >
                                      {SHIFT_STATES.map((s) => (
                                        <option key={s} value={s}>
                                          {all.states[s]}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                )}
                              </>
                            )}
                            <label className="field wide">
                              <span>{r.comment}</span>
                              <input
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                minLength={3}
                                required
                              />
                            </label>
                            <button type="submit" className="btn primary" disabled={busy}>
                              {r.approve}
                            </button>
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => decide(req, 'REJECTED')}
                            >
                              {r.reject}
                            </button>
                          </form>
                        )}
                        <h3>{r.history}</h3>
                        <ul className="list">
                          {detail.decisions.map((d) => (
                            <li key={d.id}>
                              {localTime(d.at)} {d.stepKey}:{' '}
                              {d.decision === 'APPROVED'
                                ? all.requests.approvedShort
                                : all.requests.rejectedShort}
                              <small className="muted">
                                {' '}
                                · {d.actingRole ?? d.actorType} · {d.comment}
                              </small>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}

      <h2>{r.overtimeTitle}</h2>
      {overtime.length === 0 ? (
        <p className="muted">{r.overtimeEmpty}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{r.employee}</th>
              <th>{all.admin.operations.plan}</th>
              <th>{r.overtimeMinutes}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {overtime.map((row) => (
              <tr key={row.shiftSessionId}>
                <td>{row.employeeName}</td>
                <td>{row.businessDate}</td>
                <td>{row.minutes}</td>
                <td>
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      decideOvertime(row, 'APPROVED');
                    }}
                  >
                    <label className="field wide">
                      <span>{r.comment}</span>
                      <input
                        value={overtimeComment[row.shiftSessionId] ?? ''}
                        onChange={(e) =>
                          setOvertimeComment((c) => ({
                            ...c,
                            [row.shiftSessionId]: e.target.value,
                          }))
                        }
                        minLength={3}
                        required
                      />
                    </label>
                    <button type="submit" className="btn primary" disabled={busy}>
                      {r.approve}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => decideOvertime(row, 'REJECTED')}
                    >
                      {r.reject}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Документ відкривається лише HR; для решти сервер відповідає 403 і пише аудит (FR-REQ-02). */
function MedicalLink({ request }: { readonly request: RequestView }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (!request.medicalMediaId) return <p className="muted">{r.medical}: ✓</p>;
  if (url) {
    return (
      <p>
        <a href={url} target="_blank" rel="noreferrer">
          {r.openMedical}
        </a>
      </p>
    );
  }
  return (
    <p>
      <button
        type="button"
        className="link"
        onClick={() => {
          requestsApi
            .medicalLink(request.id)
            .then((l) => setUrl(l.url))
            .catch((e: unknown) => setFailed(describeError(e)));
        }}
      >
        {failed ?? r.openMedical}
      </button>
    </p>
  );
}
