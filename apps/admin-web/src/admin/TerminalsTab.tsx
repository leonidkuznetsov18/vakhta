import { kioskUrl } from '@/shared/config';
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isBlank, isUnchanged } from '@/lib/forms';
import {
  RegisterTerminalCommand,
  type OrgSnapshot,
  type TerminalPairingIssued,
  type TerminalView,
} from '@vakhta/contracts';
import { TerminalConnectivity } from '@vakhta/domain';
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
import { Muted, Section, StatusPill, type PillTone } from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { adminOrgApi } from '../api.ts';
import { readError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { keys } from '@/lib/query';
import { notifySuccess } from '@/lib/toast';
import { setUiState, usePersistentState } from '@/lib/ui-store';
import { AddDialog } from '@/components/app/add-dialog';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  Link2OffIcon,
  PencilIcon,
  PowerIcon,
  PowerOffIcon,
  Trash2Icon,
  type LucideIcon,
} from 'lucide-react';
import { IconButton } from '@/shared/ui/icon-button';
import { validateWith, type FieldErrors } from '@/lib/validation';

const all = messages(currentLocale());
const t = all.admin.administration;
const tr = t.terminals;
const hints = all.ui.hints;
const CHECKPOINTS = ['BOTH', 'ENTRY', 'EXIT'] as const;
const CONNECTIVITIES = Object.values(TerminalConnectivity);
/** One pill per terminal: connectivity already folds in the enabled and paired state. */
const STATUS_PILL: Record<TerminalConnectivity, { tone: PillTone; icon: LucideIcon }> = {
  [TerminalConnectivity.ONLINE]: { tone: 'success', icon: CircleCheckIcon },
  [TerminalConnectivity.OFFLINE]: { tone: 'danger', icon: CircleAlertIcon },
  [TerminalConnectivity.UNPAIRED]: { tone: 'warning', icon: Link2OffIcon },
  [TerminalConnectivity.DISABLED]: { tone: 'neutral', icon: PowerOffIcon },
};
/** Public kiosk address, baked in at build time; without it only the code is shown. */
const KIOSK_URL = kioskUrl();

interface Props {
  readonly org: OrgSnapshot;
}

/** The kiosk reads `?terminal=<id>` to show that terminal when this browser has paired it. */
function kioskLink(terminalId: string): string | null {
  if (!KIOSK_URL) return null;
  return `${KIOSK_URL.replace(/\/$/, '')}/?terminal=${encodeURIComponent(terminalId)}`;
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
  const [connectivityFilter, setConnectivityFilter] = usePersistentState<'' | TerminalConnectivity>(
    'terminals.connectivity',
    '',
  );
  const visibleRows = connectivityFilter
    ? terminalRows.filter((term) => term.connectivity === connectivityFilter)
    : terminalRows;

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
      setCreated({
        ...term,
        status: 'ACTIVE',
        paired: false,
        lastSeenAt: null,
        connectivity: TerminalConnectivity.UNPAIRED,
      });
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
      header: (
        <span className="inline-flex items-center gap-1">
          {tr.status}
          <InfoTip text={hints.terminalsConnectivity} />
        </span>
      ),
      label: tr.status,
      cell: (term) => <TerminalStatus term={term} />,
    },
    {
      key: 'seen',
      sortValue: (term) => term.lastSeenAt,
      header: tr.lastSeen,
      cell: (term) => (term.lastSeenAt ? formatDateTime(term.lastSeenAt) : tr.never),
    },
    {
      key: 'kiosk',
      header: <span className="sr-only">{tr.openKiosk}</span>,
      label: tr.openKiosk,
      align: 'right',
      cell: (term) => <OpenKioskButton term={term} />,
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
                <Button type="submit" pending={register.isPending} disabled={busy || isBlank(name)}>
                  {t.common.add}
                </Button>
              </DialogFooter>
            </form>
          </AddDialog>
        }
      >
        <SelectField
          label={tr.connectivityFilter}
          value={connectivityFilter}
          onChange={(v) => setConnectivityFilter(v as '' | TerminalConnectivity)}
          placeholder="—"
          options={CONNECTIVITIES.map((c) => ({ value: c, label: tr.connectivity[c] }))}
          className="w-56"
        />
        <Feedback error={error} />
      </Section>
      <DataTable
        columns={columns}
        rows={visibleRows}
        resetKey={connectivityFilter}
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
                    pending={pair.isPending}
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
            pending: pair.isPending && pair.variables.id === term.id,
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
            pending: setStatus.isPending && setStatus.variables.term.id === term.id,
            destructive: term.status === 'ACTIVE',
            separator: true,
            onSelect: () => void toggle(term),
          },
          {
            key: 'delete',
            label: tr.delete,
            icon: Trash2Icon,
            disabled: busy,
            pending: drop.isPending && drop.variables.term.id === term.id,
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

function TerminalStatus({ term }: { readonly term: TerminalView }) {
  const pill = STATUS_PILL[term.connectivity];
  return (
    <StatusPill tone={pill.tone}>
      <pill.icon aria-hidden="true" />
      {tr.connectivity[term.connectivity]}
    </StatusPill>
  );
}

function OpenKioskButton({ term }: { readonly term: TerminalView }) {
  const href = kioskLink(term.id);
  if (!href) return null;
  return (
    <IconButton
      asChild
      // A link, not a button: IconButton's default `type` must not reach the anchor.
      type={undefined}
      icon={ExternalLinkIcon}
      label={`${tr.openKiosk}: ${term.name}`}
      tooltip={hints.terminalsOpenKiosk}
      variant="ghost"
      size="icon-sm"
    >
      <a href={href} target="_blank" rel="noopener noreferrer" />
    </IconButton>
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
            pending={busy}
            disabled={
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
