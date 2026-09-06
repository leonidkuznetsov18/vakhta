import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  HandoverDetailView,
  HandoverListItemView,
  MediaObjectView,
  OrgSnapshot,
} from '@vakhta/contracts';
import {
  HANDOVER_RESOLUTIONS,
  canTransitionHandover,
  type HandoverResolution,
} from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { handoversApi, orgApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';

const all = messages(currentLocale());
const h = all.admin.handover;

function localTime(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

/** «Чистота и передача» (ТЗ 9.1): черга приймань, спори, прострочення, фото за підписаними посиланнями, рішення. */
export function HandoverPage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [siteId, setSiteId] = useState('');
  const [scope, setScope] = useState<'pending' | 'overdue' | 'all'>('pending');
  const [rows, setRows] = useState<HandoverListItemView[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HandoverDetailView | null>(null);
  const [decision, setDecision] = useState<HandoverResolution | ''>('');
  const [comment, setComment] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const reloadRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    orgApi
      .snapshot()
      .then(setOrg)
      .catch((e: unknown) => setError(describeError(e)));
  }, []);

  const reload = useCallback(async () => {
    setRows(await handoversApi.list({ ...(siteId ? { siteId } : {}), scope }));
  }, [siteId, scope]);

  useEffect(() => {
    reloadRef.current = () => {
      reload().catch((e: unknown) => setError(describeError(e)));
    };
    reloadRef.current();
  }, [reload]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(handoversApi.streamUrl(), { withCredentials: true });
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener('handover', () => reloadRef.current());
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    let alive = true;
    handoversApi
      .detail(openId)
      .then((d) => alive && setDetail(d))
      .catch((e: unknown) => alive && setError(describeError(e)));
    return () => {
      alive = false;
    };
  }, [openId, rows]);

  function resolve(ev: React.FormEvent, row: HandoverListItemView) {
    ev.preventDefault();
    if (!decision || comment.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    handoversApi
      .resolve(row.id, { decision, comment: comment.trim(), ...(reasonCode ? { reasonCode } : {}) })
      .then(async () => {
        setNotice(h.applied);
        setDecision('');
        setComment('');
        setReasonCode('');
        await reload();
      })
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false));
  }

  const handoverReasons = org?.reasonCodes.filter((r) => r.kind === 'HANDOVER' && r.isActive) ?? [];

  return (
    <section>
      <div className="toolbar">
        <label>
          <span>{h.site}</span>
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
          {(['pending', 'overdue', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              className={scope === s ? 'active' : undefined}
              onClick={() => setScope(s)}
            >
              {s === 'pending' ? h.scopePending : s === 'overdue' ? h.scopeOverdue : h.scopeAll}
            </button>
          ))}
        </div>
        <span className={live ? 'live on' : 'live'}>
          {live ? h.live : all.admin.operations.offline}
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="notice">{notice}</p>}

      {rows.length === 0 ? (
        <p className="muted">{h.empty}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{h.submitted}</th>
              <th>{h.zone}</th>
              <th>{h.submitter}</th>
              <th>{h.status}</th>
              <th>{h.remarks}</th>
              <th>{h.photos}</th>
              <th>{h.deadline}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <React.Fragment key={row.id}>
                <tr className={row.overdue ? 'flagged' : undefined}>
                  <td>{localTime(row.submittedAt)}</td>
                  <td>{row.zoneName}</td>
                  <td>{row.submittedByName}</td>
                  <td>
                    <span className={`status-badge ${row.status}`}>
                      {all.handover.statuses[row.status]}
                    </span>
                    {row.cannotCompleteReason && (
                      <span className="flag warn">{h.cannotComplete}</span>
                    )}
                  </td>
                  <td>{row.remarks}</td>
                  <td>{row.photos.length}</td>
                  <td>
                    {localTime(row.acceptDeadlineAt)}
                    {row.overdue && <span className="flag">{h.overdue}</span>}
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="link"
                      onClick={() => setOpenId(openId === row.id ? null : row.id)}
                    >
                      {h.detail}
                    </button>
                  </td>
                </tr>
                {openId === row.id && detail && detail.handover.id === row.id && (
                  <tr>
                    <td colSpan={8}>
                      <div className="subpanel">
                        {HANDOVER_RESOLUTIONS.some((d) => canTransitionHandover(row.status, d)) && (
                          <form className="inline-form" onSubmit={(e) => resolve(e, row)}>
                            <label className="field">
                              <span>{h.decision}</span>
                              <select
                                value={decision}
                                onChange={(e) => setDecision(e.target.value as HandoverResolution)}
                                required
                              >
                                <option value="">…</option>
                                {HANDOVER_RESOLUTIONS.filter((d) =>
                                  canTransitionHandover(row.status, d),
                                ).map((d) => (
                                  <option key={d} value={d}>
                                    {all.handover.resolutions[d]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="field">
                              <span>{h.reasonCode}</span>
                              <select
                                value={reasonCode}
                                onChange={(e) => setReasonCode(e.target.value)}
                              >
                                <option value="">—</option>
                                {handoverReasons.map((r) => (
                                  <option key={r.code} value={r.code}>
                                    {r.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="field wide">
                              <span>{h.comment}</span>
                              <input
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                minLength={3}
                                required
                              />
                            </label>
                            <button
                              type="submit"
                              className="btn primary"
                              disabled={busy || !decision}
                            >
                              {h.apply}
                            </button>
                          </form>
                        )}
                        <div className="detail">
                          <div>
                            <h3>{h.checklist}</h3>
                            <ul className="list">
                              {detail.handover.items.map((item) => (
                                <li key={item.key}>
                                  {!item.answered ? '▫️' : item.ok ? '✅' : '⚠️'} {item.label}
                                  {item.answered && !item.ok && (
                                    <small className="muted">
                                      {' '}
                                      · {item.remarkCategory} · {item.remarkText} ·{' '}
                                      {item.safeToWork ? h.safe : h.unsafe}
                                      {item.needs.length > 0
                                        ? ` · ${item.needs.map((n) => all.handover.needs[n]).join(', ')}`
                                        : ''}
                                    </small>
                                  )}
                                  {item.kind === 'NOTE' && item.answered && (
                                    <small className="muted"> · {h.note}</small>
                                  )}
                                </li>
                              ))}
                            </ul>
                            {detail.handover.cannotCompleteReason && (
                              <p className="muted">
                                {h.cannotComplete}: {detail.handover.cannotCompleteReason}
                                {detail.handover.cannotCompleteComment
                                  ? ` · ${detail.handover.cannotCompleteComment}`
                                  : ''}
                              </p>
                            )}
                          </div>
                          <div>
                            <h3>{h.photos}</h3>
                            <ul className="list">
                              {detail.handover.photos.map((p) => (
                                <li key={p.angle}>
                                  {all.handover.angles[p.angle]} ·{' '}
                                  {all.handover.quality[p.media.quality]}{' '}
                                  <PhotoLink media={p.media} />
                                </li>
                              ))}
                            </ul>
                            <h3>{h.reviews}</h3>
                            <ul className="list">
                              {detail.reviews.map((r) => (
                                <li key={r.id}>
                                  {localTime(r.reviewedAt)} <strong>{r.reviewerName}</strong>{' '}
                                  {r.decision === 'ACCEPTED' ? '✅' : '⚠️'}
                                  {r.category ? ` · ${r.category}` : ''}
                                  {r.comment ? ` · ${r.comment}` : ''}{' '}
                                  {r.media && <PhotoLink media={r.media} />}
                                </li>
                              ))}
                            </ul>
                            <h3>{h.resolutions}</h3>
                            <ul className="list">
                              {detail.resolutions.map((r) => (
                                <li key={r.id}>
                                  {localTime(r.at)} {all.handover.resolutions[r.decision]}
                                  <small className="muted"> · {r.comment}</small>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Підписане посилання запитується по кліку і живе кілька хвилин (FR-PHO-06). */
function PhotoLink({ media }: { readonly media: MediaObjectView }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {h.openPhoto}
      </a>
    );
  }
  return (
    <button
      type="button"
      className="link"
      onClick={() => {
        handoversApi
          .mediaLink(media.id)
          .then((l) => setUrl(l.url))
          .catch((e: unknown) => setFailed(describeError(e)));
      }}
    >
      {failed ?? h.openPhoto}
    </button>
  );
}
