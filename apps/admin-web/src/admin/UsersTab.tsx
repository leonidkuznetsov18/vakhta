import { useEffect, useState, type FormEvent } from 'react';
import type { OrgSnapshot, WebUserView } from '@vakhta/contracts';
import { SCOPE_TYPES, WEB_ROLES, type ScopeType, type WebRole } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback, useAction } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Section, StatusPill } from '@/components/app/page';
import { usersApi } from '../api.ts';
import { currentLocale } from '../i18n.tsx';
import { usePersistentState } from '@/lib/persistent-state';

const all = messages(currentLocale());
const t = all.admin.administration;
const u = t.users;
const hints = all.ui.hints;

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

/** Panel accounts and scoped roles (spec 2: the administrator manages permissions). */
export function UsersTab({ org }: { readonly org: OrgSnapshot }) {
  const [list, setList] = useState<WebUserView[]>([]);
  const [email, setEmail] = usePersistentState('users.email', '');
  const [name, setName] = usePersistentState('users.name', '');
  const [password, setPassword] = useState('');
  const [grantFor, setGrantFor] = usePersistentState<string | null>('users.grantFor', null);
  const [role, setRole] = useState<WebRole>('SHIFT_MASTER');
  const [scopeType, setScopeType] = useState<ScopeType>('ENTERPRISE');
  const [scopeId, setScopeId] = useState('');
  const { busy, error, notice, run } = useAction();

  useEffect(() => {
    void run(async () => setList(await usersApi.list()));
  }, [run]);

  function replace(updated: WebUserView) {
    setList((l) => l.map((x) => (x.id === updated.id ? updated : x)));
  }

  function create(ev: FormEvent) {
    ev.preventDefault();
    void run(async () => {
      const created = await usersApi.create({ email, name, password, roles: [] });
      setList((l) => [created, ...l]);
      setEmail('');
      setName('');
      setPassword('');
    }, t.common.added);
  }

  function grant(ev: FormEvent, user: WebUserView) {
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

  const columns: Column<WebUserView>[] = [
    { key: 'email', header: u.email, cell: (user) => user.email },
    { key: 'name', header: u.name, cell: (user) => user.name },
    {
      key: '2fa',
      header: (
        <span className="inline-flex items-center gap-1">
          {u.twoFactor}
          <InfoTip text={hints.usersTwoFactor} />
        </span>
      ),
      cell: (user) =>
        user.twoFactorEnabled ? (
          <StatusPill tone="success">{all.ui.common.yes}</StatusPill>
        ) : (
          <StatusPill>{all.ui.common.no}</StatusPill>
        ),
    },
    {
      key: 'roles',
      header: (
        <span className="inline-flex items-center gap-1">
          {u.roles}
          <InfoTip text={hints.usersScope} />
        </span>
      ),
      cell: (user) => (
        <div className="flex flex-wrap gap-1">
          {user.roles.map((g) => (
            <Badge key={g.id} variant="secondary" className="gap-1 pr-1">
              {all.roles[g.role]}
              <span className="text-muted-foreground">
                {u.scopeTypes[g.scopeType]}
                {scopeName(g.scopeType, g.scopeId) ? ` · ${scopeName(g.scopeType, g.scopeId)}` : ''}
              </span>
              <button
                type="button"
                disabled={busy}
                aria-label={`${u.revoke} ${all.roles[g.role]}`}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => revoke(user, g.id)}
              >
                <XIcon className="size-3" aria-hidden="true" />
              </button>
            </Badge>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Section title={u.create} hint={hints.usersPassword}>
        <form className="flex flex-wrap items-end gap-3" onSubmit={create} autoComplete="off">
          <FormField label={u.email} className="min-w-56">
            {(id) => (
              <Input
                id={id}
                type="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
                autoComplete="off"
              />
            )}
          </FormField>
          <FormField label={u.name} className="min-w-48">
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                required
                minLength={2}
              />
            )}
          </FormField>
          <FormField label={u.password} className="min-w-56">
            {(id) => (
              <Input
                id={id}
                type="password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
              />
            )}
          </FormField>
          <Button type="submit" disabled={busy}>
            {u.create}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">{u.passwordHint}</p>
        <Feedback error={error} notice={notice} />
      </Section>

      <DataTable
        columns={columns}
        rows={list}
        storageKey="users"
        onRowClick={(user) => setGrantFor(grantFor === user.id ? null : user.id)}
        rowActions={(user) => [
          {
            key: 'grant',
            label: u.grantRole,
            onSelect: () => setGrantFor(grantFor === user.id ? null : user.id),
          },
        ]}
        rowKey={(user) => user.id}
        empty={t.common.empty}
        expanded={(user) =>
          grantFor === user.id ? (
            <form className="flex flex-wrap items-end gap-3" onSubmit={(ev) => grant(ev, user)}>
              <SelectField
                label={u.role}
                value={role}
                onChange={(v) => setRole(v as WebRole)}
                options={WEB_ROLES.map((r) => ({ value: r, label: all.roles[r] }))}
                className="w-56"
              />
              <SelectField
                label={u.scopeType}
                value={scopeType}
                onChange={(v) => {
                  setScopeType(v as ScopeType);
                  setScopeId('');
                }}
                options={SCOPE_TYPES.map((s) => ({ value: s, label: u.scopeTypes[s] }))}
                hint={hints.usersScope}
                className="w-48"
              />
              {scopeType !== 'ENTERPRISE' && (
                <SelectField
                  label={u.scope}
                  value={scopeId}
                  onChange={setScopeId}
                  placeholder="…"
                  required
                  options={options.map((o) => ({ value: o.id, label: o.name }))}
                  className="w-56"
                />
              )}
              <Button
                type="submit"
                variant="secondary"
                disabled={busy || (scopeType !== 'ENTERPRISE' && !scopeId)}
              >
                {u.grant}
              </Button>
            </form>
          ) : null
        }
      />
    </div>
  );
}
