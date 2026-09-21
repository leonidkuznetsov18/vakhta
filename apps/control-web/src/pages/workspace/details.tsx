import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { TenantDetailView } from '@vakhta/contracts';
import { TenantSecretKind, TenantStatus, type TenantSurface } from '@vakhta/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { controlApi, queryKeys } from '@/shared/api';
import { t } from '@/shared/i18n';
import { FailureState, Field, LoadingState, StatusBadge } from '@/shared/ui';
import { InfoCard, describeError, secretPresent, type TabProps } from './shared';

export function DatabaseTab({ detail }: { detail: TenantDetailView }) {
  const m = t().workspace;
  const rows: [string, string][] = [
    [m.database, detail.databaseName],
    [m.schemaVersion, detail.schemaVersion ?? m.never],
    [m.migratedAt, detail.migratedAt ? new Date(detail.migratedAt).toLocaleString() : m.never],
    ['storage', detail.storagePrefix || '—'],
  ];
  return (
    <Card>
      <CardContent className="grid gap-2 pt-6 text-sm sm:grid-cols-[200px_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <span className="text-muted-foreground">{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function BotTab({ detail, onChanged }: TabProps) {
  const m = t().workspace;
  const [token, setToken] = useState('');
  const save = useMutation({
    mutationFn: () => controlApi.setBotToken(detail.id, { botToken: token }),
    onSuccess: async () => {
      setToken('');
      await onChanged();
      toast.success(m.tokenSaved);
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  });
  const present = secretPresent(detail, TenantSecretKind.BOT_TOKEN) ? m.present : m.absent;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InfoCard
        title={m.bot}
        lines={[
          detail.botUsername ? `@${detail.botUsername}` : m.botMissing,
          `${m.webhookSecret}: ${present}`,
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>{m.setToken}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
            placeholder={t().create.botTokenPlaceholder}
          />
          <Button
            type="button"
            disabled={token.length < 30 || save.isPending}
            onClick={() => save.mutate()}
          >
            {m.setToken}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function DomainsTab({ detail, onChanged }: TabProps) {
  const m = t().workspace;
  const [host, setHost] = useState('');
  const [surface, setSurface] = useState<TenantSurface>('PANEL');
  const add = useMutation({
    mutationFn: () => controlApi.addDomain(detail.id, { host, surface, isPrimary: false }),
    onSuccess: async () => {
      setHost('');
      await onChanged();
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.host}</TableHead>
              <TableHead>{m.surface}</TableHead>
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.domains.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.host}</TableCell>
                <TableCell>{d.surface}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {d.isManaged ? m.managed : m.custom}
                  {d.isPrimary ? ` · ${m.primary}` : ''}
                </TableCell>
                <TableCell>
                  <StatusBadge code={d.status} label={m.domainStatus[d.status]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{m.addDomain}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label={m.host}>
            <Input value={host} onChange={(e) => setHost(e.target.value.trim().toLowerCase())} />
          </Field>
          <Field label={m.surface}>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={surface}
              onChange={(e) => setSurface(e.target.value as TenantSurface)}
            >
              <option value="PANEL">{m.panel}</option>
              <option value="KIOSK">{m.kiosk}</option>
              <option value="API">{m.api}</option>
            </select>
          </Field>
          <Button
            type="button"
            disabled={host.length < 3 || add.isPending}
            onClick={() => add.mutate()}
          >
            {m.addDomain}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function AuditTab({ id }: { id: string }) {
  const m = t().workspace;
  const audit = useQuery({ queryKey: queryKeys.audit(id), queryFn: () => controlApi.audit(id) });
  if (audit.isPending) return <LoadingState />;
  if (audit.isError) return <FailureState onRetry={() => void audit.refetch()} />;
  if (audit.data.length === 0)
    return <p className="text-sm text-muted-foreground">{m.auditEmpty}</p>;
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableBody>
          {audit.data.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {new Date(entry.at).toLocaleString()}
              </TableCell>
              <TableCell className="text-sm">{entry.actorEmail ?? 'system'}</TableCell>
              <TableCell className="font-mono text-xs">{entry.action}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {entry.objectType} {entry.objectId ?? ''}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DangerTab({ detail, onChanged }: TabProps) {
  const m = t().workspace;
  const [reason, setReason] = useState('');
  const run = useMutation({
    mutationFn: (action: 'suspend' | 'resume' | 'provision') => {
      if (action === 'suspend') return controlApi.suspend(detail.id, reason);
      if (action === 'resume') return controlApi.resume(detail.id);
      return controlApi.provision(detail.id);
    },
    onSuccess: async (_result, action) => {
      setReason('');
      await onChanged();
      if (action === 'suspend') toast.success(m.suspended);
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  });
  const suspended = detail.status === TenantStatus.SUSPENDED;
  const provisionable =
    detail.status === TenantStatus.DRAFT || detail.status === TenantStatus.ACTIVE;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{suspended ? m.resume : m.suspendTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{m.suspendHint}</p>
          {suspended ? (
            <Button type="button" disabled={run.isPending} onClick={() => run.mutate('resume')}>
              {m.resume}
            </Button>
          ) : (
            <>
              <Field label={m.reason}>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button
                type="button"
                variant="destructive"
                disabled={reason.trim().length < 3 || run.isPending}
                onClick={() => run.mutate('suspend')}
              >
                {m.suspend}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      {provisionable ? (
        <Card>
          <CardHeader>
            <CardTitle>{m.provision}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              disabled={run.isPending}
              onClick={() => run.mutate('provision')}
            >
              {m.provision}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
