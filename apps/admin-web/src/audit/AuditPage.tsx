import React, { useEffect, useState } from 'react';
import type { AuditEntryView, DomainEventView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { reportsApi } from '../api.ts';
import { describeError } from '../errors.ts';

const a = messages('ru').admin.audit;

function localTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });
}

/** «Аудит» (ТЗ 9.1, 13): незмінна історія ручних дій і журнал подій із фільтрами. */
export function AuditPage() {
  const [tab, setTab] = useState<'audit' | 'events'>('audit');
  const [action, setAction] = useState('');
  const [objectType, setObjectType] = useState('');
  const [type, setType] = useState('');
  const [audit, setAudit] = useState<AuditEntryView[]>([]);
  const [events, setEvents] = useState<DomainEventView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  function load(ev?: React.FormEvent) {
    ev?.preventDefault();
    setError(null);
    const p =
      tab === 'audit'
        ? reportsApi
            .audit({
              ...(action ? { action } : {}),
              ...(objectType ? { objectType } : {}),
              limit: 200,
            })
            .then(setAudit)
        : reportsApi.events({ ...(type ? { type } : {}), limit: 200 }).then(setEvents);
    p.catch((e: unknown) => setError(describeError(e)));
  }

  // Перезавантаження при зміні вкладки; фільтри застосовуються кнопкою «Показать».
  useEffect(() => {
    setError(null);
    const p =
      tab === 'audit'
        ? reportsApi.audit({ limit: 200 }).then(setAudit)
        : reportsApi.events({ limit: 200 }).then(setEvents);
    p.catch((e: unknown) => setError(describeError(e)));
  }, [tab]);

  return (
    <section>
      <div className="tabs" role="tablist">
        {(['audit', 'events'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : undefined}
            onClick={() => setTab(key)}
          >
            {a.tabs[key]}
          </button>
        ))}
      </div>
      <form className="toolbar" onSubmit={load}>
        {tab === 'audit' ? (
          <>
            <label>
              <span>{a.filterAction}</span>
              <input value={action} onChange={(e) => setAction(e.target.value)} />
            </label>
            <label>
              <span>{a.filterObject}</span>
              <input value={objectType} onChange={(e) => setObjectType(e.target.value)} />
            </label>
          </>
        ) : (
          <label>
            <span>{a.filterType}</span>
            <input value={type} onChange={(e) => setType(e.target.value)} />
          </label>
        )}
        <button type="submit" className="btn">
          {a.apply}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {tab === 'audit' ? (
        audit.length === 0 ? (
          <p className="muted">{a.empty}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{a.at}</th>
                <th>{a.actor}</th>
                <th>{a.action}</th>
                <th>{a.object}</th>
                <th>{a.reason}</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((e) => (
                <React.Fragment key={e.id}>
                  <tr>
                    <td>{localTime(e.at)}</td>
                    <td>
                      {e.actorType} <small className="muted">{e.actorId ?? ''}</small>
                    </td>
                    <td>
                      <code>{e.action}</code>
                    </td>
                    <td>
                      {e.objectType} <small className="muted">{e.objectId ?? ''}</small>
                    </td>
                    <td>
                      {e.reason ?? '—'}{' '}
                      {(e.before || e.after) && (
                        <button
                          type="button"
                          className="link"
                          onClick={() => setOpen(open === e.id ? null : e.id)}
                        >
                          {a.before}/{a.after}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === e.id && (
                    <tr>
                      <td colSpan={5}>
                        <pre className="json">
                          {JSON.stringify({ before: e.before, after: e.after }, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )
      ) : events.length === 0 ? (
        <p className="muted">{a.empty}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{a.at}</th>
              <th>{a.type}</th>
              <th>{a.source}</th>
              <th>{a.employee}</th>
              <th>{a.reason}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <React.Fragment key={e.id}>
                <tr>
                  <td>{localTime(e.occurredAt)}</td>
                  <td>
                    <code>{e.type}</code>
                    {e.correctsEventId && (
                      <small className="muted">
                        {' '}
                        · {a.corrects} {e.correctsEventId.slice(0, 8)}
                      </small>
                    )}
                  </td>
                  <td>
                    {e.source} <small className="muted">{e.actingRole ?? ''}</small>
                  </td>
                  <td>{e.employeeName ?? '—'}</td>
                  <td>{[e.reasonCode, e.comment].filter(Boolean).join(' · ') || '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="link"
                      onClick={() => setOpen(open === e.id ? null : e.id)}
                    >
                      {a.payload}
                    </button>
                  </td>
                </tr>
                {open === e.id && (
                  <tr>
                    <td colSpan={6}>
                      <pre className="json">{JSON.stringify(e.payload, null, 2)}</pre>
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
