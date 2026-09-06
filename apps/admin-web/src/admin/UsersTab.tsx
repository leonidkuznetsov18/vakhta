import { useEffect, useState, type FormEvent } from 'react';
import { isBlank } from '@/lib/forms';
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
import { AddDialog } from '@/components/app/add-dialog';
import { DialogFooter } from '@/components/ui/dialog';
import { ShieldPlusIcon } from 'lucide-react';
import { DetailSheet } from '@/components/app/detail-sheet';
import { generatePassword } from '@/lib/password';
import { CopyButton } from '@/components/app/copy-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { WandSparklesIcon } from 'lucide-react';
import { validateWith, type FieldErrors } from '@/lib/validation';
import { CreateWebUserCommand } from '@vakhta/contracts';

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
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const openUser = list.find((x) => x.id === grantFor) ?? null;
  const [role, setRole] = useState<WebRole>('SHIFT_MASTER');
  const [scopeType, setScopeType] = useState<ScopeType>('ENTERPRISE');
  const [scopeId, setScopeId] = useState('');
  const { busy, error, run } = useAction();

  useEffect(() => {
    void run(async () => setList(await usersApi.list()));
  }, [run]);

  function replace(updated: WebUserView) {
    setList((l) => l.map((x) => (x.id === updated.id ? updated : x)));
  }

  function create(ev: FormEvent) {
    ev.preventDefault();
    const checked = validateWith(CreateWebUserCommand, { email, name, password, roles: [] });
    setFieldErrors(checked.errors);
    if (!checked.ok) return;
    void run(async () => {
      const created = await usersApi.create(checked.data);
      setList((l) => [created, ...l]);
      setIssued({ email: created.email, password });
      setEmail('');
      setName('');
      setPassword('');
      setCreating(false);
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
    { key: 'email', header: u.email, cell: (user) => user.email, sortValue: (user) => user.email },
    { key: 'name', header: u.name, cell: (user) => user.name, sortValue: (user) => user.name },
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
      <Section
        title={t.tabs.users}
        hint={hints.usersScope}
        actions={
          <AddDialog
            title={u.create}
            trigger={u.create}
            hint={hints.usersPassword}
            open={creating}
            onOpenChange={setCreating}
          >
            <form className="flex flex-col gap-4" onSubmit={create} autoComplete="off" noValidate>
              <FormField label={u.email} error={fieldErrors.email}>
                {(id) => (
                  <Input
                    id={id}
                    type="email"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    autoComplete="off"
                  />
                )}
              </FormField>
              <FormField label={u.name} error={fieldErrors.name}>
                {(id) => <Input id={id} value={name} onChange={(ev) => setName(ev.target.value)} />}
              </FormField>
              <FormField label={u.password} error={fieldErrors.password} hint={hints.usersGenerate}>
                {(id) => (
                  <div className="flex gap-2">
                    <Input
                      id={id}
                      type="text"
                      value={password}
                      onChange={(ev) => setPassword(ev.target.value)}
                      autoComplete="new-password"
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPassword(generatePassword())}
                    >
                      <WandSparklesIcon aria-hidden="true" />
                      {u.generate}
                    </Button>
                  </div>
                )}
              </FormField>
              <p className="text-sm text-muted-foreground">{u.passwordHint}</p>
              <Feedback error={error} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                  {t.common.cancel}
                </Button>
                <Button
                  type="submit"
                  disabled={busy || isBlank(email) || isBlank(name) || !password}
                >
                  {t.common.add}
                </Button>
              </DialogFooter>
            </form>
          </AddDialog>
        }
      >
        <Feedback error={error} />
        {issued && (
          <Alert>
            <AlertTitle>{issued.email}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 font-mono">{issued.password}</code>
                <CopyButton value={issued.password} />
              </div>
              <p className="text-sm">{u.createdOnce}</p>
            </AlertDescription>
          </Alert>
        )}
      </Section>

      <DataTable
        columns={columns}
        rows={list}
        storageKey="users"
        searchText={(user) => `${user.email} ${user.name}`}
        activeKey={grantFor}
        emptyAction={
          <Button type="button" variant="outline" onClick={() => setCreating(true)}>
            {u.create}
          </Button>
        }
        onRowClick={(user) => setGrantFor(grantFor === user.id ? null : user.id)}
        rowActions={(user) => [
          {
            key: 'grant',
            label: u.grantRole,
            icon: ShieldPlusIcon,
            onSelect: () => setGrantFor(grantFor === user.id ? null : user.id),
          },
        ]}
        rowKey={(user) => user.id}
        empty={t.common.empty}
      />
      {openUser && (
        <DetailSheet
          open
          onOpenChange={(open) => !open && setGrantFor(null)}
          title={openUser.name}
          description={openUser.email}
        >
          {((user) => (
            <>
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
            </>
          ))(openUser)}
        </DetailSheet>
      )}
    </div>
  );
}
