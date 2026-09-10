import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isBlank, isUnchanged } from '@/lib/forms';
import type {
  ChecklistDefinitionView,
  ActivationCodeIssued,
  EmployeePositionView,
  EmployeeView,
  OrgSnapshot,
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
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/app/copy-button';
import { useConfirm } from '@/components/app/confirm-dialog';
import { notifyPromise, notifySuccess } from '@/lib/toast';
import { DataTable, type Column, type RowAction } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, StatusPill, type Tone } from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { ApiError, adminEmployeesApi, checklistsApi, employeesApi } from '../api.ts';
import { describeError, readError } from '../errors.ts';
import { keys } from '@/lib/query';
import { currentLocale } from '../i18n.tsx';
import { setUiState, usePersistentState } from '@/lib/ui-store';
import { cn } from 'cn';
import { AddDialog } from '@/components/app/add-dialog';
import {
  BanIcon,
  CircleCheckIcon,
  IdCardIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  KeyRoundIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  Link2Icon,
  UserCheckIcon,
  UserXIcon,
} from 'lucide-react';
import { ImportDialog } from './ImportDialog.tsx';
import { QrCode } from '@/components/app/qr-code';
import { UploadIcon } from 'lucide-react';
import { validateWith, type FieldErrors } from '@/lib/validation';
import { CreateEmployeeCommand, UpdateEmployeeCommand } from '@vakhta/contracts';
import { CREATE_FOR_KEY } from './ChecklistsTab.tsx';
import { CodeSheet } from './CodeSheet.tsx';
import { PrinterIcon } from 'lucide-react';

const all = messages(currentLocale());
const t = all.admin.administration;
const e = t.employees;
/** The activation block is collapsed by default; issuing a code opens it where it is asked for. */
const ACTIVATION_OPEN = 'employees.activationOpen';
const hints = all.ui.hints;
const STATUS_TONE: Record<EmployeeView['status'], Tone> = {
  ACTIVE: 'success',
  BLOCKED: 'warning',
  TERMINATED: 'neutral',
};

/** Employee cards: creation, activation code, position, status, Telegram relink (spec 2, FR-ID-*). */
export function EmployeesTab({ org }: { readonly org: OrgSnapshot }) {
  const [personnelNumber, setPersonnelNumber] = usePersistentState('employees.personnelNumber', '');
  const [fullName, setFullName] = usePersistentState('employees.fullName', '');
  const [email, setEmail] = usePersistentState('employees.email', '');
  const [phone, setPhone] = usePersistentState('employees.phone', '');
  const [telegramUsername, setTelegramUsername] = usePersistentState('employees.telegram', '');
  const [newOrgUnitId, setNewOrgUnitId] = usePersistentState('employees.newOrgUnit', '');
  const [newPositionId, setNewPositionId] = usePersistentState('employees.newPosition', '');
  const [newTeamId, setNewTeamId] = usePersistentState('employees.newTeam', '');
  const [issued, setIssued] = useState<ActivationCodeIssued | null>(null);
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const checklists =
    useQuery({ queryKey: keys.checklists, queryFn: () => checklistsApi.list() }).data ?? [];
  /** Active checklists of a position: what the bot will ask this employee for (ADR-0012). */
  const checklistsOf = (positionId: string) =>
    checklists.filter((c) => c.isActive && c.positions.some((p) => p.id === positionId));
  const [importing, setImporting] = useState(false);
  const [statusFilter, setStatusFilter] = usePersistentState<'' | EmployeeView['status']>(
    'employees.status',
    '',
  );
  const [openId, setOpenId] = usePersistentState<string | null>('employees.openId', null);
  const [relinkFor, setRelinkFor] = useState<EmployeeView | null>(null);
  const { confirm, dialog } = useConfirm();
  const client = useQueryClient();
  const roster = useQuery({ queryKey: keys.employees, queryFn: () => employeesApi.list() });
  const list = roster.data ?? [];
  /** One roster on the server; every card that changes re-reads it rather than patching a copy. */
  const reload = () => client.invalidateQueries({ queryKey: keys.employees });

  const add = useMutation({
    mutationFn: (cmd: CreateEmployeeCommand) => adminEmployeesApi.create(cmd),
    onSuccess: async () => {
      notifySuccess(t.common.added);
      setPersonnelNumber('');
      setFullName('');
      setEmail('');
      setPhone('');
      setTelegramUsername('');
      setNewOrgUnitId('');
      setNewPositionId('');
      setNewTeamId('');
      setCreating(false);
      await reload();
    },
  });

  const drop = useMutation({
    mutationFn: async (v: { emp: EmployeeView; reason: string }) => {
      try {
        await adminEmployeesApi.remove(v.emp.id, v.reason);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'EMPLOYEE_HAS_HISTORY') {
          throw new Error(e.hasHistory);
        }
        throw err;
      }
    },
    onSuccess: async (_result, v) => {
      notifySuccess(e.employeeDeleted);
      if (openId === v.emp.id) setOpenId(null);
      await reload();
    },
  });

  const issue = useMutation({
    mutationFn: (emp: EmployeeView) => adminEmployeesApi.issueCode(emp.id),
    onSuccess: (code) => setIssued(code),
  });

  const setStatus = useMutation({
    mutationFn: (v: { emp: EmployeeView; status: EmployeeView['status']; reason: string }) =>
      adminEmployeesApi.changeStatus(v.emp.id, { status: v.status, reason: v.reason }),
    onSuccess: async () => {
      notifySuccess(e.statusChanged);
      await reload();
    },
  });

  const issueMany = useMutation({
    mutationFn: (ids: readonly string[]) => adminEmployeesApi.issueCodes([...ids]),
    onSuccess: (codes, ids) => {
      notifySuccess(format(e.codesIssued, { n: ids.length }));
      setSheet(codes);
      setSelected(new Set());
    },
  });

  const unitName = (id: string) => org.orgUnits.find((u) => u.id === id)?.name ?? id;
  const positionName = (id: string) => org.positions.find((p) => p.id === id)?.name ?? id;

  function create(ev: FormEvent) {
    ev.preventDefault();
    const checked = validateWith(CreateEmployeeCommand, {
      personnelNumber,
      fullName,
      status: 'ACTIVE',
      email,
      phone,
      telegramUsername,
      orgUnitId: newOrgUnitId,
      positionId: newPositionId,
      teamId: newTeamId,
    });
    // The contract reports a format failure as a generic message; name the format here.
    const errors: FieldErrors = { ...checked.errors };
    if (errors.phone) errors.phone = e.invalidPhone;
    if (errors.telegramUsername) errors.telegramUsername = e.invalidTelegram;
    setFieldErrors(errors);
    if (checked.ok) add.mutate(checked.data);
  }

  /** Hard delete with a reason; a card with worked history is refused and the panel points to "Terminate". */
  async function deleteEmployee(emp: EmployeeView) {
    const reason = await confirm({
      title: e.deleteEmployee,
      description: format(e.deleteEmployeeConfirm, { name: emp.fullName }),
      confirmLabel: e.deleteEmployee,
      commentLabel: t.common.reason,
      commentRequired: true,
      destructive: true,
    });
    if (!reason) return;
    drop.mutate({ emp, reason });
  }

  /** The card holds the activation block; the row action opens it with a fresh code. */
  function issueCode(emp: EmployeeView) {
    setOpenId(emp.id);
    // A fresh code has to be visible, and the block it lands in is collapsed by default.
    setUiState({ [ACTIVATION_OPEN]: true });
    issue.mutate(emp);
  }

  async function changeStatus(emp: EmployeeView, status: EmployeeView['status']) {
    // Coming back from a dismissal is its own action: it needs a new activation code, because the
    // dismissal released the Telegram account so the phone could be used on another card.
    const reinstating = status === 'ACTIVE' && emp.status === 'TERMINATED';
    const label = reinstating
      ? e.reinstate
      : status === 'BLOCKED'
        ? e.block
        : status === 'ACTIVE'
          ? e.unblock
          : e.terminate;
    const reason = await confirm({
      title: `${label}: ${emp.fullName}`,
      description: reinstating ? e.reinstateHint : hints.employeesStatus,
      confirmLabel: label,
      commentLabel: t.common.reason,
      commentRequired: true,
      destructive: status === 'TERMINATED',
    });
    if (!reason) return;
    setStatus.mutate({ emp, status, reason });
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<ActivationCodeIssued[] | null>(null);
  const selectable = list.filter((x) => selected.has(x.id) && x.status === 'ACTIVE');

  function issueSelected() {
    if (selectable.length > 0) issueMany.mutate(selectable.map((x) => x.id));
  }

  /** Delete every selected card: no history deletes it, history terminates it; the toast shows both counts. */
  const dropMany = useMutation({
    mutationFn: (v: { ids: readonly string[]; reason: string }) =>
      notifyPromise(adminEmployeesApi.bulkDelete([...v.ids], v.reason), {
        loading: format(e.deletingSelected, { n: v.ids.length }),
        success: (r) =>
          format(e.deleteSelectedResult, { deleted: r.deleted, terminated: r.terminated }),
        error: (err) => describeError(err),
      }),
    onSuccess: async (result, v) => {
      setSelected(new Set());
      if (openId && v.ids.includes(openId)) setOpenId(null);
      if (result.deleted > 0 || result.terminated > 0) await reload();
    },
  });

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const reason = await confirm({
      title: e.deleteSelected,
      description: format(e.deleteSelectedConfirm, { n: ids.length }),
      confirmLabel: e.deleteSelected,
      commentLabel: t.common.reason,
      commentRequired: true,
      destructive: true,
    });
    if (reason) dropMany.mutate({ ids, reason });
  }
  const busy =
    add.isPending ||
    drop.isPending ||
    issue.isPending ||
    setStatus.isPending ||
    issueMany.isPending ||
    dropMany.isPending;
  const error = readError(
    roster.error ??
      add.error ??
      drop.error ??
      issue.error ??
      setStatus.error ??
      issueMany.error ??
      dropMany.error,
  );

  const [telegramFilter, setTelegramFilter] = usePersistentState<'' | 'LINKED' | 'NOT_LINKED'>(
    'employees.telegram',
    '',
  );
  const visibleList = list.filter(
    (x) =>
      (!statusFilter || x.status === statusFilter) &&
      (!telegramFilter || x.telegramLinked === (telegramFilter === 'LINKED')),
  );

  const columns: Column<EmployeeView>[] = [
    {
      key: 'number',
      header: e.personnelNumber,
      sortValue: (emp) => emp.personnelNumber,
      cell: (emp) => <span className="tabular-nums">{emp.personnelNumber}</span>,
    },
    {
      key: 'name',
      header: e.fullName,
      cell: (emp) => emp.fullName,
      sortValue: (emp) => emp.fullName,
    },
    {
      key: 'position',
      header: (
        <span className="inline-flex items-center gap-1">
          {e.position}
          <InfoTip text={hints.employeesPositionColumn} />
        </span>
      ),
      cell: (emp) =>
        emp.currentPosition ? (
          <span>
            {positionName(emp.currentPosition.positionId)}
            <Muted> · {unitName(emp.currentPosition.orgUnitId)}</Muted>
          </span>
        ) : (
          <Muted>{e.noPosition}</Muted>
        ),
    },
    {
      key: 'checklist',
      header: (
        <span className="inline-flex items-center gap-1">
          {e.checklist}
          <InfoTip text={hints.employeesChecklistColumn} />
        </span>
      ),
      cell: (emp) => {
        if (!emp.currentPosition) return <Muted>{e.noPosition}</Muted>;
        if (checklists === null) return <Muted>…</Muted>;
        const own = checklistsOf(emp.currentPosition.positionId);
        return own.length > 0 ? (
          <span>{own.map((c) => c.name).join(', ')}</span>
        ) : (
          <StatusPill tone="warning">{e.noChecklist}</StatusPill>
        );
      },
    },
    {
      key: 'status',
      header: e.status,
      cell: (emp) => (
        <StatusPill tone={STATUS_TONE[emp.status]}>{e.statuses[emp.status]}</StatusPill>
      ),
    },
    {
      key: 'telegram',
      header: e.telegram,
      cell: (emp) =>
        emp.telegramLinked ? (
          <StatusPill tone="info">{e.linked}</StatusPill>
        ) : (
          <Muted>{e.notLinked}</Muted>
        ),
    },
  ];

  const rowActions = (emp: EmployeeView): RowAction[] => [
    {
      key: 'position',
      label: e.position,
      icon: IdCardIcon,
      onSelect: () => setOpenId(openId === emp.id ? null : emp.id),
    },
    ...(emp.status === 'ACTIVE'
      ? [
          {
            key: 'code',
            label: e.issueCode,
            icon: KeyRoundIcon,
            disabled: busy,
            onSelect: () => issueCode(emp),
          },
        ]
      : []),
    ...(emp.telegramLinked && emp.status === 'ACTIVE'
      ? [
          {
            key: 'relink',
            label: e.relink,
            icon: Link2Icon,
            disabled: busy,
            onSelect: () => setRelinkFor(emp),
          },
        ]
      : []),
    ...(emp.status === 'ACTIVE'
      ? [
          {
            key: 'block',
            label: e.block,
            icon: BanIcon,
            disabled: busy,
            separator: true,
            onSelect: () => void changeStatus(emp, 'BLOCKED'),
          },
        ]
      : []),
    ...(emp.status === 'BLOCKED'
      ? [
          {
            key: 'unblock',
            label: e.unblock,
            icon: CircleCheckIcon,
            disabled: busy,
            separator: true,
            onSelect: () => void changeStatus(emp, 'ACTIVE'),
          },
        ]
      : []),
    ...(emp.status === 'TERMINATED'
      ? [
          {
            key: 'reinstate',
            label: e.reinstate,
            icon: UserCheckIcon,
            disabled: busy,
            separator: true,
            onSelect: () => void changeStatus(emp, 'ACTIVE'),
          },
        ]
      : []),
    ...(emp.status !== 'TERMINATED'
      ? [
          {
            key: 'terminate',
            label: e.terminate,
            icon: UserXIcon,
            disabled: busy,
            destructive: true,
            onSelect: () => void changeStatus(emp, 'TERMINATED'),
          },
        ]
      : []),
    {
      key: 'delete',
      label: e.deleteEmployee,
      icon: Trash2Icon,
      disabled: busy,
      destructive: true,
      separator: true,
      onSelect: () => void deleteEmployee(emp),
    },
  ];

  /** The card under its row: details and activation on the left, position and checklist on the right. */
  function renderCard(emp: EmployeeView) {
    return (
      <div className="flex flex-col gap-3 py-1" data-testid="employee-card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{emp.fullName}</span>
          <Muted>
            {emp.personnelNumber} · {e.statuses[emp.status]}
          </Muted>
          <span className="ml-auto flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => void deleteEmployee(emp)}
            >
              <Trash2Icon aria-hidden="true" />
              {e.deleteEmployee}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpenId(null)}>
              <XIcon aria-hidden="true" />
              {all.ui.common.close}
            </Button>
          </span>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <EmployeeDetailsForm key={emp.id} employee={emp} onSaved={reload} />
            <ActivationPanel
              employee={emp}
              issued={issued?.employeeId === emp.id ? issued : null}
              busy={busy}
              onIssue={() => issueCode(emp)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <PositionPanel employee={emp} org={org} onAssigned={reload} />
            {emp.currentPosition && (
              <ChecklistPanel
                positionId={emp.currentPosition.positionId}
                positionName={positionName(emp.currentPosition.positionId)}
                checklists={checklists}
                onChanged={() => client.invalidateQueries({ queryKey: keys.checklists })}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        title={t.tabs.employees}
        hint={hints.employeesActivation}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setImporting(true)}>
              <UploadIcon aria-hidden="true" />
              {e.import}
            </Button>
            <AddDialog
              title={e.create}
              trigger={e.create}
              open={creating}
              onOpenChange={setCreating}
            >
              <form className="flex flex-col gap-4" onSubmit={create} noValidate>
                <FormField
                  label={e.personnelNumber}
                  hint={hints.employeesPersonnelNumber}
                  error={fieldErrors.personnelNumber}
                >
                  {(id) => (
                    <Input
                      id={id}
                      value={personnelNumber}
                      placeholder={e.personnelNumberPlaceholder}
                      autoComplete="off"
                      onChange={(ev) => setPersonnelNumber(ev.target.value)}
                    />
                  )}
                </FormField>
                <FormField
                  label={e.fullName}
                  hint={hints.employeesFullName}
                  error={fieldErrors.fullName}
                >
                  {(id) => (
                    <Input
                      id={id}
                      value={fullName}
                      placeholder={e.fullNamePlaceholder}
                      autoComplete="off"
                      onChange={(ev) => setFullName(ev.target.value)}
                    />
                  )}
                </FormField>
                <FormField
                  label={e.email}
                  hint={hints.employeesEmail}
                  error={fieldErrors.email}
                  optional
                >
                  {(id) => (
                    <Input
                      id={id}
                      type="email"
                      inputMode="email"
                      value={email}
                      placeholder={e.emailPlaceholder}
                      autoComplete="off"
                      onChange={(ev) => setEmail(ev.target.value)}
                    />
                  )}
                </FormField>
                <FormField
                  label={e.phone}
                  hint={hints.employeesPhone}
                  error={fieldErrors.phone}
                  optional
                >
                  {(id) => (
                    <Input
                      id={id}
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      placeholder={e.phonePlaceholder}
                      autoComplete="off"
                      onChange={(ev) => setPhone(ev.target.value)}
                    />
                  )}
                </FormField>
                <FormField
                  label={e.telegramUsername}
                  hint={hints.employeesTelegram}
                  error={fieldErrors.telegramUsername}
                  optional
                >
                  {(id) => (
                    <Input
                      id={id}
                      value={telegramUsername}
                      placeholder={e.telegramPlaceholder}
                      autoComplete="off"
                      onChange={(ev) => setTelegramUsername(ev.target.value)}
                    />
                  )}
                </FormField>
                <div className="grid gap-3 sm:grid-cols-3">
                  <SelectField
                    label={e.newOrgUnit}
                    hint={hints.employeesNewAssignment}
                    value={newOrgUnitId}
                    onChange={(v) => {
                      setNewOrgUnitId(v);
                      setNewTeamId('');
                    }}
                    placeholder={e.notChosen}
                    options={org.orgUnits.map((u) => ({ value: u.id, label: u.name }))}
                  />
                  <SelectField
                    label={e.newPosition}
                    value={newPositionId}
                    onChange={setNewPositionId}
                    placeholder={e.notChosen}
                    error={fieldErrors.positionId}
                    options={org.positions.map((p) => ({ value: p.id, label: p.name }))}
                  />
                  <SelectField
                    label={e.newTeam}
                    value={newTeamId}
                    onChange={setNewTeamId}
                    placeholder={e.notChosen}
                    disabled={!newOrgUnitId}
                    options={org.teams
                      .filter((tm) => tm.orgUnitId === newOrgUnitId)
                      .map((tm) => ({ value: tm.id, label: tm.name }))}
                  />
                </div>
                <Muted className="text-xs">{e.newAssignmentHint}</Muted>
                <Feedback error={error} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                    {t.common.cancel}
                  </Button>
                  <Button
                    type="submit"
                    disabled={busy || isBlank(personnelNumber) || isBlank(fullName)}
                  >
                    {t.common.add}
                  </Button>
                </DialogFooter>
              </form>
            </AddDialog>
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label={e.statusFilter}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as '' | EmployeeView['status'])}
            placeholder="—"
            options={(['ACTIVE', 'BLOCKED', 'TERMINATED'] as const).map((st) => ({
              value: st,
              label: e.statuses[st],
            }))}
            className="w-56"
          />
          <SelectField
            label={e.telegramFilter}
            value={telegramFilter}
            onChange={(v) => setTelegramFilter(v as '' | 'LINKED' | 'NOT_LINKED')}
            placeholder="—"
            options={[
              { value: 'LINKED', label: e.linked },
              { value: 'NOT_LINKED', label: e.notLinked },
            ]}
            className="w-56"
          />
        </div>
        <Feedback error={error} />
      </Section>

      <DataTable
        columns={columns}
        rows={visibleList}
        rowKey={(emp) => emp.id}
        searchText={(emp) =>
          `${emp.fullName} ${emp.personnelNumber} ${emp.email ?? ''} ${emp.phone ?? ''} ${emp.telegramUsername ?? ''}`
        }
        searchPlaceholder={e.search}
        activeKey={openId}
        empty={t.common.empty}
        storageKey="employees"
        selectedKeys={selected}
        onSelectionChange={setSelected}
        selectionBar={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              disabled={busy || selectable.length === 0}
              onClick={issueSelected}
            >
              <PrinterIcon aria-hidden="true" />
              {e.issueCodesSelected} ({selectable.length})
            </Button>
            <InfoTip text={hints.employeesBulkCodes} />
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy || selected.size === 0}
              onClick={deleteSelected}
            >
              <Trash2Icon aria-hidden="true" />
              {e.deleteSelected} ({selected.size})
            </Button>
          </div>
        }
        loading={roster.isPending}
        emptyAction={
          <Button type="button" variant="outline" onClick={() => setCreating(true)}>
            {e.create}
          </Button>
        }
        onRowClick={(emp) => setOpenId(openId === emp.id ? null : emp.id)}
        expanded={(emp) => (emp.id === openId ? renderCard(emp) : null)}
        rowActions={rowActions}
        rowClassName={(emp) => (emp.status !== 'ACTIVE' ? 'text-muted-foreground' : undefined)}
      />
      <CodeSheet codes={sheet} employees={list} onClose={() => setSheet(null)} />
      <ImportDialog open={importing} onOpenChange={setImporting} onImported={reload} />
      {dialog}
      <RelinkDialog
        employee={relinkFor}
        onClose={() => setRelinkFor(null)}
        onRelinked={() => {
          setRelinkFor(null);
          void reload();
        }}
      />
    </div>
  );
}

/** Relinking needs two inputs (Telegram user id and a reason), so it gets its own dialog. */
function RelinkDialog({
  employee,
  onClose,
  onRelinked,
}: {
  readonly employee: EmployeeView | null;
  readonly onClose: () => void;
  readonly onRelinked: () => void;
}) {
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const telegramUserId = Number(userId);
  const valid = Number.isInteger(telegramUserId) && telegramUserId > 0 && reason.trim().length >= 3;

  const relink = useMutation({
    mutationFn: (id: string) =>
      adminEmployeesApi.relink(id, { telegramUserId, reason: reason.trim() }),
    onSuccess: () => {
      setUserId('');
      setReason('');
      onRelinked();
    },
  });
  const busy = relink.isPending;
  const error = readError(relink.error);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (employee && valid) relink.mutate(employee.id);
  }

  return (
    <Dialog open={employee !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1">
            {e.relink}
            <InfoTip text={hints.employeesRelink} />
          </DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FormField label={e.relinkUserId}>
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={userId}
                onChange={(ev) => setUserId(ev.target.value)}
                required
              />
            )}
          </FormField>
          <FormField label={t.common.reason}>
            {(id) => (
              <Textarea
                id={id}
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
                required
                minLength={3}
              />
            )}
          </FormField>
          <Feedback error={error} notice={null} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={busy || !valid}>
              {e.relink}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PositionPanel({
  employee,
  org,
  onAssigned,
}: {
  readonly employee: EmployeeView;
  readonly org: OrgSnapshot;
  readonly onAssigned: () => void;
}) {
  const history = useQuery({
    queryKey: keys.employeePositions(employee.id),
    queryFn: () => adminEmployeesApi.positions(employee.id),
  });
  const current = history.data?.find((h) => h.validTo === null) ?? null;
  const unitName = (id: string) => org.orgUnits.find((u) => u.id === id)?.name ?? id;
  const positionName = (id: string) => org.positions.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1 text-sm">
        <strong>{e.currentPosition}:</strong>{' '}
        {current
          ? `${positionName(current.positionId)}, ${unitName(current.orgUnitId)}`
          : e.noPosition}
        <InfoTip text={hints.employeesPosition} />
      </p>
      {/* The form opens on the assignment in force, so a save without changes is not a silent
          transfer; a new assignment mounts a form of its own rather than being written over. */}
      <AssignPositionForm
        key={current?.id ?? 'none'}
        employeeId={employee.id}
        org={org}
        current={current}
        onAssigned={onAssigned}
      />
    </div>
  );
}

function AssignPositionForm({
  employeeId,
  org,
  current,
  onAssigned,
}: {
  readonly employeeId: string;
  readonly org: OrgSnapshot;
  readonly current: EmployeePositionView | null;
  readonly onAssigned: () => void;
}) {
  const client = useQueryClient();
  const [orgUnitId, setOrgUnitId] = useState(current?.orgUnitId ?? org.orgUnits[0]?.id ?? '');
  const [positionId, setPositionId] = useState(current?.positionId ?? org.positions[0]?.id ?? '');
  const [teamId, setTeamId] = useState(current?.teamId ?? '');
  const teams = org.teams.filter((tm) => tm.orgUnitId === orgUnitId);

  const move = useMutation({
    mutationFn: () =>
      adminEmployeesApi.assignPosition(employeeId, {
        orgUnitId,
        positionId,
        ...(teamId ? { teamId } : {}),
      }),
    onSuccess: async () => {
      notifySuccess(e.positionAssigned);
      await client.invalidateQueries({ queryKey: keys.employeePositions(employeeId) });
      onAssigned();
    },
  });
  const busy = move.isPending;
  const error = readError(move.error);

  function assign(ev: FormEvent) {
    ev.preventDefault();
    move.mutate();
  }

  return (
    <>
      <form className="flex flex-wrap items-end gap-3" onSubmit={assign}>
        <SelectField
          label={t.common.orgUnit}
          value={orgUnitId}
          onChange={(v) => {
            setOrgUnitId(v);
            setTeamId('');
          }}
          options={org.orgUnits.map((u) => ({ value: u.id, label: u.name }))}
          className="w-56"
        />
        <SelectField
          label={e.position}
          value={positionId}
          onChange={setPositionId}
          options={org.positions.map((p) => ({ value: p.id, label: p.name }))}
          className="w-56"
        />
        <SelectField
          label={t.common.team}
          value={teamId}
          onChange={setTeamId}
          placeholder={t.common.none}
          options={teams.map((tm) => ({ value: tm.id, label: tm.name }))}
          className="w-48"
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={
            busy ||
            !orgUnitId ||
            !positionId ||
            (current !== null &&
              isUnchanged(
                { orgUnitId, positionId, teamId: teamId || null },
                {
                  orgUnitId: current.orgUnitId,
                  positionId: current.positionId,
                  teamId: current.teamId,
                },
              ))
          }
        >
          {e.assignPosition}
        </Button>
      </form>
      <Feedback error={error} />
    </>
  );
}

/**
 * The checklist of the employee's position (ADR-0012): one per position. It can be replaced by
 * another existing checklist or removed; nothing is copied.
 */
/**
 * Activation inside the card: what the administrator does, the button, then the code, the link
 * and the QR of the last issued code for this employee.
 */
function ActivationPanel({
  employee,
  issued,
  busy,
  onIssue,
}: {
  readonly employee: EmployeeView;
  readonly issued: ActivationCodeIssued | null;
  readonly busy: boolean;
  readonly onIssue: () => void;
}) {
  const canIssue = employee.status === 'ACTIVE';
  // Collapsed by default: the block is long, and most cards are opened for something else.
  const [open, setOpen] = usePersistentState(ACTIVATION_OPEN, false);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 items-center gap-1 text-left text-sm font-medium"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRightIcon
            className={cn('size-4 transition-transform', open && 'rotate-90')}
            aria-hidden="true"
          />
          <KeyRoundIcon className="size-4" aria-hidden="true" />
          {e.activation}
        </button>
        <InfoTip text={hints.employeesActivation} />
        <StatusPill tone={employee.telegramLinked ? 'success' : 'warning'}>
          {employee.telegramLinked ? e.linked : e.notLinked}
        </StatusPill>
        {canIssue && !employee.telegramLinked && (
          <Button
            type="button"
            size="sm"
            variant={issued ? 'outline' : 'default'}
            className="ml-auto"
            disabled={busy}
            onClick={onIssue}
          >
            <KeyRoundIcon aria-hidden="true" />
            {issued ? e.reissueCodeButton : e.issueCodeButton}
          </Button>
        )}
      </div>
      {!open ? null : employee.telegramLinked ? (
        <Muted>{e.activationLinked}</Muted>
      ) : !canIssue ? (
        <Muted>{e.activationUnavailable}</Muted>
      ) : (
        <>
          <Muted>{e.activationIntro}</Muted>
          <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-sm text-muted-foreground">
            {e.activationSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </>
      )}
      {open && issued && (
        <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{e.issueCode}:</span>
            <code className="rounded bg-background px-2 py-1 font-mono text-xl font-semibold tracking-widest">
              {issued.code}
            </code>
            <CopyButton value={issued.code} />
            <Muted className="text-xs">
              {format(e.codeValidUntil, { expires: formatDateTime(issued.expiresAt) })}
            </Muted>
          </div>
          <div className="flex flex-wrap items-start gap-4">
            <QrCode value={issued.deepLink} size={144} label={e.deepLink} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{e.deepLink}:</span>
                <code className="rounded bg-background px-1.5 py-0.5 text-xs break-all">
                  {issued.deepLink}
                </code>
                <CopyButton value={issued.deepLink} />
              </div>
              <Muted className="flex items-center gap-1 text-xs">
                {e.qrHint}
                <InfoTip text={hints.employeesQr} />
              </Muted>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Editable card: number, name and contacts with the same hints, placeholders and validation as
 * the creation form; the save button wakes up only when something changed. The contacts also
 * render as links, so the card stays usable without editing.
 */
function EmployeeDetailsForm({
  employee,
  onSaved,
}: {
  readonly employee: EmployeeView;
  readonly onSaved: () => void;
}) {
  const initial = {
    personnelNumber: employee.personnelNumber,
    fullName: employee.fullName,
    email: employee.email ?? '',
    phone: employee.phone ?? '',
    telegramUsername: employee.telegramUsername ?? '',
  };
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [editing, setEditing] = useState(false);
  const unchanged = isUnchanged(draft, initial);

  const save = useMutation({
    mutationFn: (cmd: UpdateEmployeeCommand) => adminEmployeesApi.update(employee.id, cmd),
    onSuccess: () => {
      notifySuccess(e.detailsSaved);
      setEditing(false);
      onSaved();
    },
  });
  const busy = save.isPending;
  const error = readError(save.error);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const checked = validateWith(UpdateEmployeeCommand, draft);
    const next: FieldErrors = { ...checked.errors };
    if (next.phone) next.phone = e.invalidPhone;
    if (next.telegramUsername) next.telegramUsername = e.invalidTelegram;
    setErrors(next);
    if (checked.ok) save.mutate(checked.data);
  }

  const field = (key: keyof typeof draft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-sm font-medium">
            {e.details}
            <InfoTip text={e.detailsHint} />
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => setEditing(true)}
          >
            <PencilIcon aria-hidden="true" />
            {e.editDetails}
          </Button>
        </div>
        <ContactsRow employee={employee} />
      </div>
    );
  }
  return (
    <form className="flex flex-col gap-3 rounded-lg border p-3" onSubmit={submit} noValidate>
      <span className="flex items-center gap-1 text-sm font-medium">
        {e.details}
        <InfoTip text={e.detailsHint} />
      </span>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label={e.personnelNumber}
          hint={hints.employeesPersonnelNumber}
          error={errors.personnelNumber}
        >
          {(id) => (
            <Input
              id={id}
              value={draft.personnelNumber}
              placeholder={e.personnelNumberPlaceholder}
              onChange={(ev) => field('personnelNumber')(ev.target.value)}
            />
          )}
        </FormField>
        <FormField label={e.fullName} hint={hints.employeesFullName} error={errors.fullName}>
          {(id) => (
            <Input
              id={id}
              value={draft.fullName}
              placeholder={e.fullNamePlaceholder}
              onChange={(ev) => field('fullName')(ev.target.value)}
            />
          )}
        </FormField>
        <FormField label={e.email} hint={hints.employeesEmail} error={errors.email} optional>
          {(id) => (
            <Input
              id={id}
              type="email"
              inputMode="email"
              value={draft.email}
              placeholder={e.emailPlaceholder}
              onChange={(ev) => field('email')(ev.target.value)}
            />
          )}
        </FormField>
        <FormField label={e.phone} hint={hints.employeesPhone} error={errors.phone} optional>
          {(id) => (
            <Input
              id={id}
              type="tel"
              inputMode="tel"
              value={draft.phone}
              placeholder={e.phonePlaceholder}
              onChange={(ev) => field('phone')(ev.target.value)}
            />
          )}
        </FormField>
        <FormField
          label={e.telegramUsername}
          hint={hints.employeesTelegram}
          error={errors.telegramUsername}
          optional
        >
          {(id) => (
            <Input
              id={id}
              value={draft.telegramUsername}
              placeholder={e.telegramPlaceholder}
              onChange={(ev) => field('telegramUsername')(ev.target.value)}
            />
          )}
        </FormField>
      </div>
      <Feedback error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft(initial);
            setErrors({});
            setEditing(false);
          }}
        >
          {t.common.cancel}
        </Button>
        <Button type="submit" size="sm" disabled={busy || unchanged}>
          {all.ui.common.save}
        </Button>
      </div>
    </form>
  );
}

/** Opens the checklists tab with the create dialog and this position ticked (hash change switches the tab). */
function createChecklistFor(positionId: string): void {
  try {
    setUiState({ [CREATE_FOR_KEY]: positionId });
  } catch {
    // Storage unavailable: the tab still opens, without the preset.
  }
  location.hash = '#/administration/checklists';
}

/** Optional contacts of the card as links: mail, call, open the Telegram profile. */
function ContactsRow({ employee }: { readonly employee: EmployeeView }) {
  const items: { key: string; label: string; href: string; text: string }[] = [];
  if (employee.email)
    items.push({
      key: 'email',
      label: e.email,
      href: `mailto:${employee.email}`,
      text: employee.email,
    });
  if (employee.phone)
    items.push({
      key: 'phone',
      label: e.phone,
      href: `tel:${employee.phone}`,
      text: employee.phone,
    });
  if (employee.telegramUsername)
    items.push({
      key: 'telegram',
      label: e.telegramUsername,
      href: `https://t.me/${employee.telegramUsername}`,
      text: `@${employee.telegramUsername}`,
    });
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{e.contacts}</span>
      {items.length === 0 ? (
        <Muted>{e.noContacts}</Muted>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-1">
              <Muted>{item.label}:</Muted>
              <a
                href={item.href}
                target={item.key === 'telegram' ? '_blank' : undefined}
                rel="noreferrer"
                className="underline-offset-4 hover:underline"
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChecklistPanel({
  positionId,
  positionName,
  checklists,
  onChanged,
}: {
  readonly positionId: string;
  readonly positionName: string;
  readonly checklists: readonly ChecklistDefinitionView[];
  readonly onChanged: () => void;
}) {
  const [pick, setPick] = useState('');
  const [replacing, setReplacing] = useState(false);
  const { confirm, dialog } = useConfirm();
  const current =
    checklists.find((c) => c.isActive && c.positions.some((p) => p.id === positionId)) ?? null;
  const available = checklists.filter((c) => c.isActive && c.id !== current?.id);

  const attachTo = useMutation({
    mutationFn: (checklistId: string) => checklistsApi.addPosition(checklistId, positionId),
    onSuccess: () => {
      notifySuccess(current ? e.checklistReplaced : e.checklistAdded);
      setPick('');
      setReplacing(false);
      onChanged();
    },
  });
  const detach = useMutation({
    mutationFn: (checklistId: string) => checklistsApi.removePosition(checklistId, positionId),
    onSuccess: () => {
      notifySuccess(e.checklistRemoved);
      onChanged();
    },
  });
  const busy = attachTo.isPending || detach.isPending;
  const error = readError(attachTo.error ?? detach.error);

  async function attach(ev: FormEvent) {
    ev.preventDefault();
    if (!pick) return;
    if (current) {
      const ok = await confirm({
        title: e.replaceChecklist,
        description: format(e.replaceConfirm, { name: current.name }),
        confirmLabel: e.replaceChecklist,
      });
      if (ok === false) return;
    }
    attachTo.mutate(pick);
  }

  async function remove() {
    if (!current) return;
    const ok = await confirm({
      title: e.removeChecklist,
      description: format(e.removeConfirm, { name: current.name }),
      confirmLabel: e.removeChecklist,
      destructive: true,
    });
    if (ok === false) return;
    detach.mutate(current.id);
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <p className="flex items-center gap-1 text-sm font-medium">
        {e.checklists} · {positionName}
        <InfoTip text={`${hints.employeesChecklists} ${e.onePerPosition}`} />
      </p>
      {current ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">{current.name}</span>
          <Muted>
            {format(t.checklists.itemsSummary, {
              items: current.items.length,
              photos: current.items.filter((i) => i.kind === 'PHOTO').length,
            })}
          </Muted>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            aria-expanded={replacing}
            onClick={() => setReplacing((v) => !v)}
          >
            {e.replaceChecklist}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void remove()}
          >
            {e.removeChecklist}
          </Button>
        </div>
      ) : (
        <Alert>
          <AlertTitle>{e.noChecklist}</AlertTitle>
          <AlertDescription>
            <p>{e.noChecklistHint}</p>
            <Button type="button" size="sm" onClick={() => createChecklistFor(positionId)}>
              <ClipboardListIcon aria-hidden="true" />
              {e.createChecklistFor}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {(!current || replacing) && available.length === 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Muted className="text-xs">{e.noOtherChecklists}</Muted>
          {current && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => createChecklistFor(positionId)}
            >
              <ClipboardListIcon aria-hidden="true" />
              {e.createChecklistFor}
            </Button>
          )}
        </div>
      )}
      {(!current || replacing) && available.length > 0 && (
        <form className="flex flex-wrap items-end gap-3" onSubmit={attach}>
          <SelectField
            label={current ? e.replaceChecklist : e.addChecklist}
            value={pick}
            onChange={setPick}
            placeholder="…"
            options={available.map((c) => ({ value: c.id, label: c.name }))}
            className="w-64"
          />
          <Button type="submit" variant="secondary" disabled={busy || !pick}>
            {current ? e.replaceChecklist : t.common.add}
          </Button>
        </form>
      )}
      <Feedback error={error} />
      {dialog}
    </div>
  );
}
