import React, { useEffect, useState } from 'react';
import type { OrgSnapshot, ReportKind, ReportTableView } from '@vakhta/contracts';
import { REPORT_KINDS } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { orgApi, reportsApi } from '../api.ts';
import { describeError } from '../errors.ts';

const r = messages('ru').admin.reports;

function monthStart(): string {
  const d = new Date();
  return `${d.toISOString().slice(0, 7)}-01`;
}

/** «Отчёты» (ТЗ 9.3): шість звітів у табличному вигляді, CSV/XLSX з версією даних. */
export function ReportsPage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [kind, setKind] = useState<ReportKind>('hours');
  const [siteId, setSiteId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ReportTableView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    orgApi
      .snapshot()
      .then(setOrg)
      .catch((e: unknown) => setError(describeError(e)));
  }, []);

  const q = { ...(siteId ? { siteId } : {}), ...(orgUnitId ? { orgUnitId } : {}), from, to };

  function build(ev?: React.FormEvent) {
    ev?.preventDefault();
    setBusy(true);
    setError(null);
    reportsApi
      .build(kind, q)
      .then(setReport)
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false));
  }

  const units = org?.orgUnits.filter((u) => !siteId || u.siteId === siteId) ?? [];

  return (
    <section>
      <form className="toolbar" onSubmit={build}>
        <label>
          <span>{r.kinds[kind] ? 'Отчёт' : ''}</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ReportKind)}
            aria-label="Отчёт"
          >
            {REPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {r.kinds[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{r.site}</span>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">—</option>
            {org?.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{r.orgUnit}</span>
          <select value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
            <option value="">—</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{r.from}</span>
          <input
            type="date"
            value={from}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
          />
        </label>
        <label>
          <span>{r.to}</span>
          <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
        <button type="submit" className="btn primary" disabled={busy}>
          {r.build}
        </button>
        {report && (
          <>
            <a
              className="btn"
              href={reportsApi.exportUrl(kind, q, 'csv')}
              target="_blank"
              rel="noreferrer"
            >
              {r.exportCsv}
            </a>
            <a
              className="btn"
              href={reportsApi.exportUrl(kind, q, 'xlsx')}
              target="_blank"
              rel="noreferrer"
            >
              {r.exportXlsx}
            </a>
          </>
        )}
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <>
          <p className="muted">
            {report.title} · {report.from} – {report.to} · {r.generatedAt}{' '}
            {new Date(report.generatedAt).toLocaleString('ru-RU')} · {r.dataVersion}{' '}
            {report.dataVersion}
          </p>
          {report.rows.length === 0 ? (
            <p className="muted">{r.empty}</p>
          ) : (
            <div className="grid-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {report.columns.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, i) => (
                    <tr key={i}>
                      {report.columns.map((c) => (
                        <td key={c.key}>{row[c.key] ?? '—'}</td>
                      ))}
                    </tr>
                  ))}
                  {report.totals && (
                    <tr className="totals">
                      {report.columns.map((c) => (
                        <td key={c.key}>{report.totals?.[c.key] ?? ''}</td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
