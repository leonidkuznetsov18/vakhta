import React, { useEffect, useState } from 'react';
import type { OrgSnapshot, WebUserView } from '@vakhta/contracts';
import { SCOPE_TYPES, WEB_ROLES, type ScopeType, type WebRole } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { usersApi } from '../api.ts';
import { Feedback, Field, useAction } from './ui.tsx';

const all = messages('ru');
const t = all.admin.administration;
const u = t.users;

function scopeOptions(
  org: OrgSnapshot,
  scopeType: ScopeType,
): readonly { id: string; name: string }[] {
  switch (scopeType) {
    case 'SITE':
      return org.sites;
    case 'ORG_UNIT':
      return org.orgUnits;
    case 'TEAM':
      return org.teams;
    case 'ZONE':
      return org.zones;
    case 'ENTERPRISE':
      return [];
  }
}

/** Облікові записи панелі та ролі з областю (ТЗ 2: адміністратор «управляет правами»). */
export function UsersTab({ org }: { readonly org: OrgSnapshot }) {
  const [list, setList] = useState<WebUserView[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [grantFor, setGrantFor] = useState<string | null>(null);
  const [role, setRole] = useState<WebRole>('SHIFT_MASTER');
  const [scopeType, setScopeType] = useState<ScopeType>('ENTERPRISE');
  const [scopeId, setScopeId] = useState('');
  const { busy, error, notice, run } = useAction();

  useEffect(() => {
    void run(async () => setList(await usersApi.list()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function replace(updated: WebUserView) {
    setList((l) => l.map((x) => (x.id === updated.id ? updated : x)));
  }

  function create(ev: React.FormEvent) {
    ev.preventDefault();
    void run(async () => {
      const created = await usersApi.create({ email, name, password, roles: [] });
      setList((l) => [created, ...l]);
      setEmail('');
      setName('');
      setPassword('');
    }, t.common.added);
  }

  function grant(ev: React.FormEvent, user: WebUserView) {
    ev.preventDefault();
    void run(async () => {
      const g = await usersApi.grant(user.id, {
        role,
        scopeType,
        ...(scopeType === 'ENTERPRISE' ? {} : { scopeId }),
      });
      replace({ ...user, roles: [...user.roles, g] });
      setGrantFor(null);
    }, u.granted);
  }

  function revoke(user: WebUserView, grantId: string) {
    void run(async () => {
      await usersApi.revoke(user.id, grantId);
      replace({ ...user, roles: user.roles.filter((g) => g.id !== grantId) });
    }, u.revoked);
  }

  const scopeName = (type: ScopeType, id: string | null) =>
    id ? (scopeOptions(org, type).find((o) => o.id === id)?.name ?? id) : null;
  const options = scopeOptions(org, scopeType);

  return (
    <div>
      <form className="inline-form" onSubmit={create} autoComplete="off">
        <Field label={u.email}>
          <input
            type="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
            autoComplete="off"
          />
        </Field>
        <Field label={u.name}>
          <input value={name} onChange={(ev) => setName(ev.target.value)} required minLength={2} />
        </Field>
        <Field label={u.password}>
          <input
            type="password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
        </Field>
        <button type="submit" className="btn primary" disabled={busy}>
          {u.create}
        </button>
        <small className="muted hint">{u.passwordHint}</small>
      </form>
      <Feedback error={error} notice={notice} />
      {list.length === 0 ? (
        <p className="muted">{t.common.empty}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{u.email}</th>
              <th>{u.name}</th>
              <th>{u.twoFactor}</th>
              <th>{u.roles}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((user) => (
              <React.Fragment key={user.id}>
                <tr>
                  <td>{user.email}</td>
                  <td>{user.name}</td>
                  <td>{user.twoFactorEnabled ? '✓' : '—'}</td>
                  <td>
                    <div className="chips">
                      {user.roles.map((g) => (
                        <span key={g.id} className="chip">
                          {all.roles[g.role]}
                          <small>
                            {u.scopeTypes[g.scopeType]}
                            {scopeName(g.scopeType, g.scopeId)
                              ? ` · ${scopeName(g.scopeType, g.scopeId)}`
                              : ''}
                          </small>
                          <button
                            type="button"
                            className="link danger"
                            disabled={busy}
                            aria-label={`${u.revoke} ${all.roles[g.role]}`}
                            onClick={() => revoke(user, g.id)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="link"
                      onClick={() => setGrantFor(grantFor === user.id ? null : user.id)}
                    >
                      {u.grantRole}
                    </button>
                  </td>
                </tr>
                {grantFor === user.id && (
                  <tr>
                    <td colSpan={5}>
                      <form className="inline-form subpanel" onSubmit={(ev) => grant(ev, user)}>
                        <Field label={u.role}>
                          <select
                            value={role}
                            onChange={(ev) => setRole(ev.target.value as WebRole)}
                          >
                            {WEB_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {all.roles[r]}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label={u.scopeType}>
                          <select
                            value={scopeType}
                            onChange={(ev) => {
                              setScopeType(ev.target.value as ScopeType);
                              setScopeId('');
                            }}
                          >
                            {SCOPE_TYPES.map((s) => (
                              <option key={s} value={s}>
                                {u.scopeTypes[s]}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {scopeType !== 'ENTERPRISE' && (
                          <Field label={u.scope}>
                            <select
                              value={scopeId}
                              onChange={(ev) => setScopeId(ev.target.value)}
                              required
                            >
                              <option value="">…</option>
                              {options.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                        )}
                        <button
                          type="submit"
                          className="btn"
                          disabled={busy || (scopeType !== 'ENTERPRISE' && !scopeId)}
                        >
                          {u.grant}
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
