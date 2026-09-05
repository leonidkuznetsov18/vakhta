import React, { useState } from 'react';
import type { OrgSnapshot, TerminalRegistered } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { adminOrgApi } from '../api.ts';
import { CopyButton, Feedback, Field, useAction } from './ui.tsx';

const t = messages('ru').admin.administration;
const tr = t.terminals;
const CHECKPOINTS = ['BOTH', 'ENTRY', 'EXIT'] as const;

interface Props {
  readonly org: OrgSnapshot;
  readonly onChanged: () => Promise<void>;
}

/** QR-термінали: реєстрація видає токен пристрою один раз (ТЗ 4.2, ADR-0006). */
export function TerminalsTab({ org, onChanged }: Props) {
  const { busy, error, notice, run } = useAction();
  const [siteId, setSiteId] = useState(org.sites[0]?.id ?? '');
  const [name, setName] = useState('');
  const [checkpoint, setCheckpoint] = useState<(typeof CHECKPOINTS)[number]>('BOTH');
  const [registered, setRegistered] = useState<TerminalRegistered | null>(null);

  const siteName = (id: string) => org.sites.find((s) => s.id === id)?.name ?? id;

  function register(ev: React.FormEvent) {
    ev.preventDefault();
    void run(async () => {
      const created = await adminOrgApi.registerTerminal({ siteId, name, checkpoint });
      setRegistered(created);
      setName('');
      await onChanged();
    }, tr.registered);
  }

  return (
    <div>
      <form className="inline-form" onSubmit={register}>
        <Field label={t.common.site}>
          <select value={siteId} onChange={(ev) => setSiteId(ev.target.value)} required>
            {org.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.common.name}>
          <input value={name} onChange={(ev) => setName(ev.target.value)} required />
        </Field>
        <Field label={tr.checkpoint}>
          <select
            value={checkpoint}
            onChange={(ev) => setCheckpoint(ev.target.value as (typeof CHECKPOINTS)[number])}
          >
            {CHECKPOINTS.map((c) => (
              <option key={c} value={c}>
                {tr.checkpoints[c]}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className="btn primary" disabled={busy || !siteId}>
          {tr.register}
        </button>
      </form>
      <Feedback error={error} notice={notice} />
      {registered && (
        <div className="notice code-issued">
          <div>
            <strong>{registered.name}</strong> · {siteName(registered.siteId)}
          </div>
          <div>
            <code>{registered.deviceToken}</code> <CopyButton value={registered.deviceToken} />
          </div>
          <small className="muted">{tr.tokenHint}</small>
        </div>
      )}
      {org.terminals.length === 0 ? (
        <p className="muted">{t.common.empty}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t.common.name}</th>
              <th>{t.common.site}</th>
              <th>{tr.checkpoint}</th>
              <th>{tr.status}</th>
              <th>{tr.lastSeen}</th>
            </tr>
          </thead>
          <tbody>
            {org.terminals.map((term) => (
              <tr key={term.id}>
                <td>{term.name}</td>
                <td>{siteName(term.siteId)}</td>
                <td>{tr.checkpoints[term.checkpoint]}</td>
                <td>{tr.statuses[term.status]}</td>
                <td>
                  {term.lastSeenAt ? new Date(term.lastSeenAt).toLocaleString('ru-RU') : tr.never}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
