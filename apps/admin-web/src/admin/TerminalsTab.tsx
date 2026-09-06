import { useState, type FormEvent } from 'react';
import type { OrgSnapshot, TerminalRegistered } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CopyButton } from '@/components/app/copy-button';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback, useAction } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { Section, StatusPill } from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { adminOrgApi } from '../api.ts';
import { currentLocale } from '../i18n.tsx';

const all = messages(currentLocale());
const t = all.admin.administration;
const tr = t.terminals;
const hints = all.ui.hints;
const CHECKPOINTS = ['BOTH', 'ENTRY', 'EXIT'] as const;

interface Props {
  readonly org: OrgSnapshot;
  readonly onChanged: () => Promise<void>;
}

/** QR terminals: registration issues the device token once (spec 4.2, ADR-0006). */
export function TerminalsTab({ org, onChanged }: Props) {
  const { busy, error, notice, run } = useAction();
  const [siteId, setSiteId] = useState(org.sites[0]?.id ?? '');
  const [name, setName] = useState('');
  const [checkpoint, setCheckpoint] = useState<(typeof CHECKPOINTS)[number]>('BOTH');
  const [registered, setRegistered] = useState<TerminalRegistered | null>(null);

  const siteName = (id: string) => org.sites.find((s) => s.id === id)?.name ?? id;

  function register(ev: FormEvent) {
    ev.preventDefault();
    void run(async () => {
      const created = await adminOrgApi.registerTerminal({ siteId, name, checkpoint });
      setRegistered(created);
      setName('');
      await onChanged();
    }, tr.registered);
  }

  const columns: Column<OrgSnapshot['terminals'][number]>[] = [
    { key: 'name', header: t.common.name, cell: (term) => term.name },
    { key: 'site', header: t.common.site, cell: (term) => siteName(term.siteId) },
    { key: 'checkpoint', header: tr.checkpoint, cell: (term) => tr.checkpoints[term.checkpoint] },
    {
      key: 'status',
      header: tr.status,
      cell: (term) => (
        <StatusPill tone={term.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {tr.statuses[term.status]}
        </StatusPill>
      ),
    },
    {
      key: 'seen',
      header: tr.lastSeen,
      cell: (term) => (term.lastSeenAt ? formatDateTime(term.lastSeenAt) : tr.never),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Section title={tr.register} hint={hints.terminalsToken}>
        <form className="flex flex-wrap items-end gap-3" onSubmit={register}>
          <SelectField
            label={t.common.site}
            value={siteId}
            onChange={setSiteId}
            required
            options={org.sites.map((s) => ({ value: s.id, label: s.name }))}
            className="w-56"
          />
          <FormField label={t.common.name} className="min-w-56 flex-1">
            {(id) => (
              <Input id={id} value={name} onChange={(ev) => setName(ev.target.value)} required />
            )}
          </FormField>
          <SelectField
            label={tr.checkpoint}
            value={checkpoint}
            onChange={(v) => setCheckpoint(v as (typeof CHECKPOINTS)[number])}
            options={CHECKPOINTS.map((c) => ({ value: c, label: tr.checkpoints[c] }))}
            hint={hints.terminalsCheckpoint}
            className="w-48"
          />
          <Button type="submit" disabled={busy || !siteId}>
            {tr.register}
          </Button>
        </form>
        <Feedback error={error} notice={notice} />
        {registered && (
          <Alert>
            <AlertTitle>
              {registered.name} · {siteName(registered.siteId)}
            </AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {registered.deviceToken}
                </code>
                <CopyButton value={registered.deviceToken} />
              </div>
              <p className="text-xs">{tr.tokenHint}</p>
            </AlertDescription>
          </Alert>
        )}
      </Section>
      <DataTable
        columns={columns}
        rows={org.terminals}
        rowKey={(term) => term.id}
        empty={t.common.empty}
      />
    </div>
  );
}
