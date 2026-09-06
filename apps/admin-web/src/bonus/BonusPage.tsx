import React, { useCallback, useEffect, useState } from 'react';
import type { BonusPeriodView, OrgSnapshot, ShiftScoreView } from '@vakhta/contracts';
import { BONUS_CRITERIA, type BonusCriterion } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { bonusApi, orgApi } from '../api.ts';
import { describeError } from '../errors.ts';

const all = messages('ru');
const b = all.admin.bonus;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** «Бонус» (ТЗ 9.1): попередній і підсумковий розрахунок, розшифровка, коригування, закриття періоду. */
export function BonusPage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [siteId, setSiteId] = useState('');
  const [month, setMonth] = useState(currentMonth);
  const [period, setPeriod] = useState<BonusPeriodView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openScore, setOpenScore] = useState<string | null>(null);
  const [criterion, setCriterion] = useState<BonusCriterion>('DISCIPLINE_SEQUENCE');
  const [delta, setDelta] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [comment, setComment] = useState('');
  const [base, setBase] = useState<Record<string, string>>({});

  useEffect(() => {
    orgApi
      .snapshot()
      .then((snapshot) => {
        setOrg(snapshot);
        if (snapshot.sites[0]) setSiteId(snapshot.sites[0].id);
      })
      .catch((e: unknown) => setError(describeError(e)));
  }, []);

  const reload = useCallback(async () => {
    if (!siteId) return;
    setPeriod(await bonusApi.period(siteId, month));
  }, [siteId, month]);

  useEffect(() => {
    reload().catch((e: unknown) => setError(describeError(e)));
  }, [reload]);

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

  function adjust(score: ShiftScoreView) {
    const d = Number(delta);
    if (!Number.isInteger(d) || d === 0 || !reasonCode || comment.trim().length < 3) return;
    void run(async () => {
      const updated = await bonusApi.adjust(score.id, {
        criterion,
        delta: d,
        reasonCode,
        comment: comment.trim(),
      });
      setNotice(
        updated.adjustments.some((a) => a.status === 'PENDING_SECOND')
          ? `${b.adjusted} ${b.needsSecond}`
          : b.adjusted,
      );
      setDelta('');
      setComment('');
      await reload();
    });
  }

  const adjustmentReasons =
    org?.reasonCodes.filter((r) => r.kind === 'ADJUSTMENT' && r.isActive) ?? [];

  return (
    <section>
      <div className="toolbar">
        <label>
          <span>{b.site}</span>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {org?.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{b.month}</span>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
        </label>
        {period && (
          <span className="muted">
            {b.period}: {period.status}
            {period.ruleLabel ? ` · ${b.ruleVersion}: ${period.ruleLabel}` : ''}
          </span>
        )}
        {period && period.status !== 'CLOSED' && (
          <button
            type="button"
            className="btn primary"
            disabled={busy || period.employees.length === 0}
            onClick={() => {
              if (!window.confirm(b.closeConfirm)) return;
              const text = window.prompt(b.comment)?.trim();
              if (!text) return;
              void run(async () => {
                await bonusApi.close(siteId, month, text);
                await reload();
              }, b.closed);
            }}
          >
            {b.closePeriod}
          </button>
        )}
        {period?.id && period.status === 'CLOSED' && (
          <a className="btn" href={bonusApi.exportUrl(period.id)} target="_blank" rel="noreferrer">
            {b.exportCsv}
          </a>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="notice">{notice}</p>}

      {period && period.pendingAdjustments.length > 0 && (
        <>
          <h2>{b.secondQueue}</h2>
          <ul className="list">
            {period.pendingAdjustments.map((a) => (
              <li key={a.id}>
                {a.employeeName} · {a.businessDate} · {all.bonus.criteria[a.criterion]}{' '}
                {a.delta > 0 ? '+' : ''}
                {a.delta}{' '}
                <small className="muted">
                  · {a.reasonCode} · {a.comment}
                </small>{' '}
                <button
                  type="button"
                  className="link"
                  disabled={busy}
                  onClick={() => {
                    const text = window.prompt(b.comment)?.trim();
                    if (!text) return;
                    void run(async () => {
                      await bonusApi.second(a.id, { decision: 'APPROVED', comment: text });
                      await reload();
                    }, b.adjusted);
                  }}
                >
                  {b.approve}
                </button>{' '}
                <button
                  type="button"
                  className="link danger"
                  disabled={busy}
                  onClick={() => {
                    const text = window.prompt(b.comment)?.trim();
                    if (!text) return;
                    void run(async () => {
                      await bonusApi.second(a.id, { decision: 'REJECTED', comment: text });
                      await reload();
                    }, b.adjusted);
                  }}
                >
                  {b.reject}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {!period || period.employees.length === 0 ? (
        <p className="muted">{b.empty}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{b.employee}</th>
              <th>{b.shifts}</th>
              <th>{b.evaluated}</th>
              <th>{b.pending}</th>
              <th>{b.sMonth}</th>
              <th>{b.base}</th>
              <th>{b.amount}</th>
            </tr>
          </thead>
          <tbody>
            {period.employees.map((e) => (
              <React.Fragment key={e.employeeId}>
                <tr>
                  <td>
                    {e.employeeName} <small className="muted">{e.personnelNumber}</small>
                  </td>
                  <td>{e.shifts}</td>
                  <td>{e.evaluatedShifts}</td>
                  <td>
                    {e.pendingShifts > 0 ? <span className="flag warn">{e.pendingShifts}</span> : 0}
                  </td>
                  <td>{e.sMonth ?? '—'}</td>
                  <td>
                    {period.status === 'CLOSED' ? (
                      <input
                        type="number"
                        min={0}
                        value={base[e.employeeId] ?? e.baseAmount ?? ''}
                        onChange={(ev) =>
                          setBase((s) => ({ ...s, [e.employeeId]: ev.target.value }))
                        }
                        aria-label={`${b.base} ${e.employeeName}`}
                      />
                    ) : (
                      (e.baseAmount ?? '—')
                    )}
                  </td>
                  <td>{e.bonusAmount ?? '—'}</td>
                </tr>
                {e.scores.map((s) => (
                  <React.Fragment key={s.id}>
                    <tr className="score-row">
                      <td className="indent">
                        {s.businessDate}{' '}
                        <span className={`status-badge ${s.status}`}>
                          {all.bonus.statuses[s.status]}
                        </span>
                      </td>
                      <td colSpan={3}>
                        {s.score ?? '—'}{' '}
                        <small className="muted">
                          ({s.earned}/{s.applicableMax})
                        </small>
                        {s.excludedReason ? (
                          <small className="muted"> · {s.excludedReason}</small>
                        ) : null}
                      </td>
                      <td colSpan={3} className="row-actions">
                        <button
                          type="button"
                          className="link"
                          onClick={() => setOpenScore(openScore === s.id ? null : s.id)}
                        >
                          {b.detail}
                        </button>
                        <button
                          type="button"
                          className="link"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => bonusApi.recompute(s.shiftSessionId).then(reload),
                              b.recomputed,
                            )
                          }
                        >
                          {b.recompute}
                        </button>
                      </td>
                    </tr>
                    {openScore === s.id && (
                      <tr>
                        <td colSpan={7}>
                          <div className="subpanel detail">
                            <div>
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>{b.criterion}</th>
                                    <th>{b.points}</th>
                                    <th>{b.basis}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.criteria.map((c) => (
                                    <tr
                                      key={c.criterion}
                                      className={c.status === 'missed' ? 'flagged' : undefined}
                                    >
                                      <td>{all.bonus.criteria[c.criterion]}</td>
                                      <td>
                                        {c.status === 'not_applicable'
                                          ? all.bonus.criterionStatuses.not_applicable
                                          : `${c.earnedPoints}/${c.maxPoints}`}{' '}
                                        <small className="muted">
                                          {all.bonus.criterionStatuses[c.status]}
                                        </small>
                                      </td>
                                      <td>
                                        <small className="muted">{c.basis.join(', ')}</small>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {s.status !== 'CONFIRMED' && (
                              <form
                                className="inline-form"
                                onSubmit={(ev) => {
                                  ev.preventDefault();
                                  adjust(s);
                                }}
                              >
                                <label className="field">
                                  <span>{b.criterion}</span>
                                  <select
                                    value={criterion}
                                    onChange={(ev) =>
                                      setCriterion(ev.target.value as BonusCriterion)
                                    }
                                  >
                                    {BONUS_CRITERIA.map((c) => (
                                      <option key={c} value={c}>
                                        {all.bonus.criteria[c]}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="field">
                                  <span>{b.delta}</span>
                                  <input
                                    type="number"
                                    min={-100}
                                    max={100}
                                    value={delta}
                                    onChange={(ev) => setDelta(ev.target.value)}
                                    required
                                  />
                                </label>
                                <label className="field">
                                  <span>{b.reasonCode}</span>
                                  <select
                                    value={reasonCode}
                                    onChange={(ev) => setReasonCode(ev.target.value)}
                                    required
                                  >
                                    <option value="">…</option>
                                    {adjustmentReasons.map((r) => (
                                      <option key={r.code} value={r.code}>
                                        {r.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="field wide">
                                  <span>{b.comment}</span>
                                  <input
                                    value={comment}
                                    onChange={(ev) => setComment(ev.target.value)}
                                    minLength={3}
                                    required
                                  />
                                </label>
                                <button type="submit" className="btn" disabled={busy}>
                                  {b.adjust}
                                </button>
                              </form>
                            )}
                            {s.adjustments.length > 0 && (
                              <ul className="list">
                                {s.adjustments.map((a) => (
                                  <li key={a.id}>
                                    {all.bonus.criteria[a.criterion]} {a.delta > 0 ? '+' : ''}
                                    {a.delta} · {a.status}{' '}
                                    <small className="muted">
                                      · {a.reasonCode} · {a.comment}
                                    </small>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
      {period?.id && period.status === 'CLOSED' && (
        <div className="actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const items = Object.entries(base)
                  .filter(([, v]) => v !== '')
                  .map(([employeeId, v]) => ({ employeeId, baseAmount: Number(v) }));
                if (items.length === 0) return;
                await bonusApi.setBase(period.id!, { items });
                await reload();
              }, b.baseSaved)
            }
          >
            {b.setBase}
          </button>
        </div>
      )}
    </section>
  );
}
