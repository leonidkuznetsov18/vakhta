import { useEffect, useState, type FormEvent } from 'react';
import { isBlank, isUnchanged } from '@/lib/forms';
import {
  RegisterTerminalCommand,
  type OrgSnapshot,
  type TerminalPairingIssued,
  type TerminalView,
} from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { usePersistentState } from '@/lib/persistent-state';
import { AddDialog } from '@/components/app/add-dialog';
import { KeyRoundIcon, PencilIcon, PowerIcon, Trash2Icon } from 'lucide-react';
import { validateWith, type FieldErrors } from '@/lib/validation';

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
  const { busy, error, run } = useAction();
  const { confirm, dialog } = useConfirm();
  const [siteId, setSiteId] = usePersistentState('terminals.siteId', org.sites[0]?.id ?? '');
  const [name, setName] = usePersistentState('terminals.name', '');
  const [checkpoint, setCheckpoint] = usePersistentState<(typeof CHECKPOINTS)[number]>(
    'terminals.checkpoint',
    'BOTH',
  );
  const [pairing, setPairing] = useState<(TerminalPairingIssued & { name: string }) | null>(null);
  const [editing, setEditing] = useState<TerminalView | null>(null);
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const siteName = (id: string) => org.sites.find((s) => s.id === id)?.name ?? id;

  function register(ev: FormEvent) {
    ev.preventDefault();
    const checked = validateWith(RegisterTerminalCommand, { siteId, name, checkpoint });
    setFieldErrors(checked.errors);
    if (!checked.ok) return;
    void run(async () => {
      const created = await adminOrgApi.registerTerminal(checked.data);
      setName('');
      setCreating(false);
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

  async function remove(term: TerminalView) {
    const reason = await confirm({
      title: format(tr.deleteConfirm, { name: term.name }),
      description: hints.terminalsDelete,
      confirmLabel: tr.delete,
      commentLabel: t.common.reason,
      commentRequired: true,
      destructive: true,
    });
    if (!reason) return;
    void run(async () => {
      await adminOrgApi.deleteTerminal(term.id, reason);
      await onChanged();
    }, tr.deleted);
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
  ];

  const link = pairing ? pairingLink(pairing.code) : null;

  return (
    <div className="flex flex-col gap-4">
      <Section
        title={t.tabs.terminals}
        hint={tr.pairHint}
        actions={
          <AddDialog
            title={tr.register}
            trigger={tr.register}
            hint={hints.terminalsPair}
            open={creating}
            onOpenChange={setCreating}
          >
            <form className="flex flex-col gap-4" onSubmit={register} noValidate>
              <SelectField
                label={t.common.site}
                error={fieldErrors.siteId}
                value={siteId}
                onChange={setSiteId}
                options={org.sites.map((s) => ({ value: s.id, label: s.name }))}
              />
              <FormField label={t.common.name} error={fieldErrors.name}>
                {(id) => <Input id={id} value={name} onChange={(ev) => setName(ev.target.value)} />}
              </FormField>
              <SelectField
                label={tr.checkpoint}
                value={checkpoint}
                onChange={(v) => setCheckpoint(v as (typeof CHECKPOINTS)[number])}
                options={CHECKPOINTS.map((c) => ({ value: c, label: tr.checkpoints[c] }))}
                hint={hints.terminalsCheckpoint}
              />
              <Feedback error={error} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" disabled={busy || isBlank(name)}>
                  {t.common.add}
                </Button>
              </DialogFooter>
            </form>
          </AddDialog>
        }
      >
        <Feedback error={error} />
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
        storageKey="terminals"
        emptyAction={
          <Button type="button" variant="outline" onClick={() => setCreating(true)}>
            {tr.register}
          </Button>
        }
        onRowClick={(term) => issue(term)}
        rowActions={(term) => [
          {
            key: 'pair',
            label: tr.pair,
            icon: KeyRoundIcon,
            disabled: busy,
            onSelect: () => issue(term),
          },
          {
            key: 'edit',
            label: tr.edit,
            icon: PencilIcon,
            disabled: busy,
            onSelect: () => setEditing(term),
          },
          {
            key: 'status',
            label: term.status === 'ACTIVE' ? tr.disable : tr.enable,
            icon: PowerIcon,
            disabled: busy,
            destructive: term.status === 'ACTIVE',
            separator: true,
            onSelect: () => void toggle(term),
          },
          {
            key: 'delete',
            label: tr.delete,
            icon: Trash2Icon,
            disabled: busy,
            destructive: true,
            onSelect: () => void remove(term),
          },
        ]}
      />
      <EditTerminalDialog
        terminal={editing}
        org={org}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await onChanged();
        }}
      />
      {dialog}
    </div>
  );
}

/** Name, site and checkpoint of an existing terminal; pairing and status have their own actions. */
function EditTerminalDialog({
  terminal,
  org,
  onClose,
  onSaved,
}: {
  readonly terminal: TerminalView | null;
  readonly org: OrgSnapshot;
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [checkpoint, setCheckpoint] = useState<(typeof CHECKPOINTS)[number]>('BOTH');
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (!terminal) return;
    setName(terminal.name);
    setSiteId(terminal.siteId);
    setCheckpoint(terminal.checkpoint);
  }, [terminal]);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!terminal || name.trim().length === 0) return;
    void run(async () => {
      await adminOrgApi.updateTerminal(terminal.id, { name: name.trim(), siteId, checkpoint });
      await onSaved();
    }, tr.updated);
  }

  return (
    <Dialog open={terminal !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {tr.edit}: {terminal?.name}
          </DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FormField label={t.common.name}>
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                required
                maxLength={200}
              />
            )}
          </FormField>
          <SelectField
            label={t.common.site}
            value={siteId}
            onChange={setSiteId}
            options={org.sites.map((s) => ({ value: s.id, label: s.name }))}
          />
          <SelectField
            label={tr.checkpoint}
            value={checkpoint}
            onChange={(v) => setCheckpoint(v as (typeof CHECKPOINTS)[number])}
            options={CHECKPOINTS.map((c) => ({ value: c, label: tr.checkpoints[c] }))}
            hint={hints.terminalsCheckpoint}
          />
          <Feedback error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={
                busy ||
                isBlank(name) ||
                (terminal !== null &&
                  isUnchanged(
                    { name: name.trim(), siteId, checkpoint },
                    {
                      name: terminal.name,
                      siteId: terminal.siteId,
                      checkpoint: terminal.checkpoint,
                    },
                  ))
              }
            >
              {all.ui.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
