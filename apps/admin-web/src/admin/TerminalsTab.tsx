import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isBlank, isUnchanged } from '@/lib/forms';
import {
  RegisterTerminalCommand,
  type OrgSnapshot,
  type TerminalPairingIssued,
  type TerminalView,
} from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
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
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, StatusPill } from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { adminOrgApi } from '../api.ts';
import { readError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { keys } from '@/lib/query';
import { notifySuccess } from '@/lib/toast';
import { setUiState, usePersistentState } from '@/lib/ui-store';
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
}

function pairingLink(code: string): string | null {
  if (!KIOSK_URL) return null;
  return `${KIOSK_URL.replace(/\/$/, '')}/#pair=${code.replace('-', '')}`;
}

/**
 * QR terminals (spec 4.2, ADR-0006): registration creates the record, a pairing code connects
 * the tablet without anyone handling a device token.
 */
export function TerminalsTab({ org }: Props) {
  const { confirm, dialog } = useConfirm();
  const client = useQueryClient();
  /** Terminals are part of the directory snapshot, so a change re-reads that one thing. */
  const reload = () => client.invalidateQueries({ queryKey: keys.org });
  const [siteId, setSiteId] = usePersistentState('terminals.siteId', org.sites[0]?.id ?? '');
  const [name, setName] = usePersistentState('terminals.name', '');
  const [checkpoint, setCheckpoint] = usePersistentState<(typeof CHECKPOINTS)[number]>(
    'terminals.checkpoint',
    'BOTH',
  );
  const [pairing, setPairing] = useState<(TerminalPairingIssued & { name: string }) | null>(null);
  const [openId, setOpenId] = usePersistentState<string | null>('terminals.openId', null);
  // A terminal registered a moment ago is shown from the response until the snapshot reloads.
  const [created, setCreated] = useState<TerminalView | null>(null);
  const terminalRows =
    created?.id === openId && !org.terminals.some((row) => row.id === created.id)
      ? [...org.terminals, created]
      : org.terminals;
  const openTerminal =
    org.terminals.find((x) => x.id === openId) ?? (created?.id === openId ? created : null);
  const [editing, setEditing] = useState<TerminalView | null>(null);
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const siteName = (id: string) => org.sites.find((s) => s.id === id)?.name ?? id;

  /** Registering also issues the first pairing code: a terminal nobody can pair is not set up. */
  const register = useMutation({
    mutationFn: async (cmd: RegisterTerminalCommand) => {
      const term = await adminOrgApi.registerTerminal(cmd);
      return { term, issued: await adminOrgApi.issuePairing(term.id) };
    },
    onSuccess: async ({ term, issued }) => {
      notifySuccess(tr.registered);
      setName('');
      setCreating(false);
      setPairing({ ...issued, name: term.name });
      setCreated({ ...term, status: 'ACTIVE', paired: false, lastSeenAt: null });
      setOpenId(term.id);
      setUiState({ 'search.terminals': '' });
      await reload();
    },
  });

  const pair = useMutation({
    mutationFn: (term: TerminalView) => adminOrgApi.issuePairing(term.id),
    onSuccess: (issued, term) => setPairing({ ...issued, name: term.name }),
  });

  const setStatus = useMutation({
    mutationFn: (v: { term: TerminalView; status: 'ACTIVE' | 'DISABLED'; reason: string }) =>
      adminOrgApi.setTerminalStatus(v.term.id, { status: v.status, reason: v.reason }),
    onSuccess: async () => {
      notifySuccess(tr.statusChanged);
      await reload();
    },
  });

  const drop = useMutation({
    mutationFn: (v: { term: TerminalView; reason: string }) =>
      adminOrgApi.deleteTerminal(v.term.id, v.reason),
    onSuccess: async () => {
      notifySuccess(tr.deleted);
      setCreated(null);
      setOpenId(null);
      await reload();
    },
  });

  const busy = register.isPending || pair.isPending || setStatus.isPending || drop.isPending;
  const error = readError(register.error ?? pair.error ?? setStatus.error ?? drop.error);

  function submitRegister(ev: FormEvent) {
    ev.preventDefault();
    const checked = validateWith(RegisterTerminalCommand, { siteId, name, checkpoint });
    setFieldErrors(checked.errors);
    if (checked.ok) register.mutate(checked.data);
  }

  function issue(term: TerminalView) {
    setOpenId(term.id);
    pair.mutate(term);
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
    setStatus.mutate({ term, status, reason });
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
    drop.mutate({ term, reason });
  }

  const columns: Column<TerminalView>[] = [
    {
      key: 'name',
      header: t.common.name,
      sortValue: (term) => term.name,
      cell: (term) => term.name,
    },
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
      sortValue: (term) => term.lastSeenAt,
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
            <form className="flex flex-col gap-4" onSubmit={submitRegister} noValidate>
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
      </Section>
      <DataTable
        columns={columns}
        rows={terminalRows}
        rowKey={(term) => term.id}
        empty={t.common.empty}
        storageKey="terminals"
        searchText={(term) => `${term.name} ${siteName(term.siteId)}`}
        rowLabel={(term) => term.name}
        expanded={(row) =>
          row.id === openId && openTerminal ? (
            <div>
              <div className="flex flex-col gap-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    <KeyRoundIcon className="size-4" aria-hidden="true" />
                    {tr.connection}
                    <InfoTip text={hints.terminalsPair} />
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto"
                    disabled={busy}
                    onClick={() => issue(openTerminal)}
                  >
                    <KeyRoundIcon aria-hidden="true" />
                    {tr.pair}
                  </Button>
                </div>
                <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-sm text-muted-foreground">
                  {tr.pairSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {pairing && pairing.name === openTerminal.name && (
                  <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
                    <p className="text-sm">
                      {format(tr.pairIssued, {
                        code: pairing.code,
                        expires: formatDateTime(pairing.expiresAt),
                      })}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-background px-2 py-1 font-mono text-xl font-semibold tracking-widest">
                        {pairing.code}
                      </code>
                      <CopyButton value={pairing.code} />
                    </div>
                    {link && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Muted>{tr.pairLink}:</Muted>
                        <code className="rounded bg-background px-1.5 py-0.5 text-xs break-all">
                          {link}
                        </code>
                        <CopyButton value={link} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null
        }
        emptyAction={
          <Button type="button" variant="outline" onClick={() => setCreating(true)}>
            {tr.register}
          </Button>
        }
        onRowClick={(term) => setOpenId(openId === term.id ? null : term.id)}
        activeKey={openId}
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
        onSaved={() => {
          setEditing(null);
          void reload();
        }}
      />
      {dialog}
    </div>
  );
}

/**
 * Name, site and checkpoint of an existing terminal; pairing and status have their own actions.
 * The form is mounted under the terminal's own key, so opening another one starts a fresh draft.
 */
function EditTerminalDialog({
  terminal,
  ...rest
}: {
  readonly terminal: TerminalView | null;
  readonly org: OrgSnapshot;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  return (
    <Dialog open={terminal !== null} onOpenChange={(open) => !open && rest.onClose()}>
      <DialogContent>
        {terminal && <EditTerminalForm key={terminal.id} terminal={terminal} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}

function EditTerminalForm({
  terminal,
  org,
  onClose,
  onSaved,
}: {
  readonly terminal: TerminalView;
  readonly org: OrgSnapshot;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [name, setName] = useState(terminal.name);
  const [siteId, setSiteId] = useState(terminal.siteId);
  const [checkpoint, setCheckpoint] = useState<(typeof CHECKPOINTS)[number]>(terminal.checkpoint);

  const save = useMutation({
    mutationFn: () =>
      adminOrgApi.updateTerminal(terminal.id, { name: name.trim(), siteId, checkpoint }),
    onSuccess: () => {
      notifySuccess(tr.updated);
      onSaved();
    },
  });
  const busy = save.isPending;
  const error = readError(save.error);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (name.trim().length > 0) save.mutate();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {tr.edit}: {terminal.name}
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
              isUnchanged(
                { name: name.trim(), siteId, checkpoint },
                {
                  name: terminal.name,
                  siteId: terminal.siteId,
                  checkpoint: terminal.checkpoint,
                },
              )
            }
          >
            {all.ui.common.save}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
