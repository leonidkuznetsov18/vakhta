import { useState, type FormEvent } from 'react';
import type { OrgSnapshot, TerminalPairingIssued, TerminalView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/app/confirm-dialog';
import { CopyButton } from '@/components/app/copy-button';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback, useAction } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, StatusPill } from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { adminOrgApi } from '../api.ts';
import { currentLocale } from '../i18n.tsx';

const all = messages(currentLocale());
const t = all.admin.administration;
const tr = t.terminals;
const hints = all.ui.hints;
const CHECKPOINTS = ['BOTH', 'ENTRY', 'EXIT'] as const;
/** Public kiosk address, baked in at build time; without it only the code is shown. */
const KIOSK_URL = import.meta.env['VITE_KIOSK_URL'];

interface Props {
  readonly org: OrgSnapshot;
  readonly onChanged: () => Promise<void>;
}

function pairingLink(code: string): string | null {
  if (!KIOSK_URL) return null;
  return `${KIOSK_URL.replace(/\/$/, '')}/#pair=${code.replace('-', '')}`;
}

/**
 * QR terminals (spec 4.2, ADR-0006): registration creates the record, a pairing code connects
 * the tablet without anyone handling a device token.
 */
export function TerminalsTab({ org, onChanged }: Props) {
  const { busy, error, notice, run } = useAction();
  const { confirm, dialog } = useConfirm();
  const [siteId, setSiteId] = useState(org.sites[0]?.id ?? '');
  const [name, setName] = useState('');
  const [checkpoint, setCheckpoint] = useState<(typeof CHECKPOINTS)[number]>('BOTH');
  const [pairing, setPairing] = useState<(TerminalPairingIssued & { name: string }) | null>(null);

  const siteName = (id: string) => org.sites.find((s) => s.id === id)?.name ?? id;

  function register(ev: FormEvent) {
    ev.preventDefault();
    void run(async () => {
      const created = await adminOrgApi.registerTerminal({ siteId, name, checkpoint });
      setName('');
      await onChanged();
      const issued = await adminOrgApi.issuePairing(created.id);
      setPairing({ ...issued, name: created.name });
    }, tr.registered);
  }

  function issue(term: TerminalView) {
    void run(async () => {
      const issued = await adminOrgApi.issuePairing(term.id);
      setPairing({ ...issued, name: term.name });
    });
  }

  async function toggle(term: TerminalView) {
    const status = term.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const label = status === 'DISABLED' ? tr.disable : tr.enable;
    const reason = await confirm({
      title: `${label}: ${term.name}`,
      description: hints.terminalsStatus,
      confirmLabel: label,
      commentLabel: t.common.reason,
      commentRequired: true,
      destructive: status === 'DISABLED',
    });
    if (!reason) return;
    void run(async () => {
      await adminOrgApi.setTerminalStatus(term.id, { status, reason });
      await onChanged();
    }, tr.statusChanged);
  }

  const columns: Column<TerminalView>[] = [
    { key: 'name', header: t.common.name, cell: (term) => term.name },
    { key: 'site', header: t.common.site, cell: (term) => siteName(term.siteId) },
    { key: 'checkpoint', header: tr.checkpoint, cell: (term) => tr.checkpoints[term.checkpoint] },
    {
      key: 'status',
      header: tr.status,
      cell: (term) => (
        <div className="flex flex-wrap gap-1">
          <StatusPill tone={term.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {tr.statuses[term.status]}
          </StatusPill>
          <StatusPill tone={term.paired ? 'info' : 'warning'}>
            {term.paired ? tr.paired : tr.notPaired}
          </StatusPill>
        </div>
      ),
    },
    {
      key: 'seen',
      header: tr.lastSeen,
      cell: (term) => (term.lastSeenAt ? formatDateTime(term.lastSeenAt) : tr.never),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{all.ui.common.actions}</span>,
      align: 'right',
      cell: (term) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => issue(term)}
          >
            {tr.pair}
          </Button>
          <Button
            type="button"
            variant={term.status === 'ACTIVE' ? 'ghost' : 'secondary'}
            size="sm"
            disabled={busy}
            onClick={() => void toggle(term)}
          >
            {term.status === 'ACTIVE' ? tr.disable : tr.enable}
          </Button>
        </div>
      ),
    },
  ];

  const link = pairing ? pairingLink(pairing.code) : null;

  return (
    <div className="flex flex-col gap-4">
      <Section title={tr.register} hint={tr.pairHint}>
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
        {pairing && (
          <Alert>
            <AlertTitle className="flex items-center gap-1">
              {pairing.name}
              <InfoTip text={hints.terminalsPair} />
            </AlertTitle>
            <AlertDescription>
              <p>
                {format(tr.pairIssued, {
                  code: pairing.code,
                  expires: formatDateTime(pairing.expiresAt),
                })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 text-lg font-semibold tracking-widest">
                  {pairing.code}
                </code>
                <CopyButton value={pairing.code} />
              </div>
              {link && (
                <div className="flex flex-wrap items-center gap-2">
                  <Muted>{tr.pairLink}:</Muted>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{link}</code>
                  <CopyButton value={link} />
                </div>
              )}
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
      {dialog}
    </div>
  );
}
