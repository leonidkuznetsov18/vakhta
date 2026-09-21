import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TenantSecretKind, TenantStatus } from '@vakhta/domain';
import { CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { controlApi, queryKeys } from '@/shared/api';
import { t } from '@/shared/i18n';
import { FailureState, Field, LoadingState } from '@/shared/ui';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { InfoCard, describeError, secretPresent, type TabProps } from './shared';

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
  const present = secretPresent(detail, TenantSecretKind.BOT_WEBHOOK_SECRET) ? m.present : m.absent;
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
          <CardTitle className="flex items-center gap-2">
            {m.setToken}
            <InfoTooltip label={m.tokenHelpTitle} text={m.tokenHelp}>
              <CircleHelp className="size-4" aria-hidden="true" />
            </InfoTooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            type="password"
            aria-label={m.setToken}
            autoComplete="new-password"
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
            placeholder={t().create.botTokenPlaceholder}
          />
          <Button
            type="button"
            disabled={token.length < 30 || save.isPending}
            onClick={() => {
              if (token.length >= 30 && !save.isPending) save.mutate();
            }}
          >
            {m.setToken}
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
