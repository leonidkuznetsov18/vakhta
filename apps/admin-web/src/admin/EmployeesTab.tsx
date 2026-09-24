import { Link } from '@tanstack/react-router';
import { avatarUrl } from '@/entities/employee';
import { useSession } from '@/auth/useSession';
import {
  rememberEmployeeList,
  employeeListReturnId,
  ProfileSheet,
  profileDirectoryOptions,
  canEditEmployee,
} from '@/features/employee-profile';
import { UserAvatar } from '@/components/app/avatar';
import { QueryFeedback } from '@/components/app/query-feedback';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isBlank, isUnchanged } from '@/lib/forms';
import type {
  ActivationCodeIssued,
  EmployeePositionView,
  EmployeeView,
  OrgSnapshot,
} from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/shared/ui/icon-button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/app/confirm-dialog';
import { notifyPromise, notifySuccess } from '@/lib/toast';
import { DataTable, type Column, type RowAction } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, StatusPill, type Tone } from '@/components/app/page';
import { adminEmployeesApi, checklistsApi } from '../api.ts';
import { describeError, readError } from '../errors.ts';
import { keys } from '@/lib/query';
import { currentLocale } from '../i18n.tsx';
import { setUiState, usePersistentState } from '@/lib/ui-store';
import { AddDialog } from '@/components/app/add-dialog';
import {
  BanIcon,
  CircleCheckIcon,
  IdCardIcon,
  KeyRoundIcon,
  Trash2Icon,
  Link2Icon,
  UserCheckIcon,
} from 'lucide-react';
import { ImportDialog } from '@/features/employee-import';
import { UploadIcon } from 'lucide-react';
import { validateWith, type FieldErrors } from '@/lib/validation';
import { CreateEmployeeCommand, EmployeeStatusSchema } from '@vakhta/contracts';
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

/** The one status change a card offers: block an active card, restore a blocked or dismissed one. */
const STATUS_ACTIONS = {
  ACTIVE: { key: 'block', icon: BanIcon, to: EmployeeStatusSchema.enum.BLOCKED },
  BLOCKED: { key: 'unblock', icon: CircleCheckIcon, to: EmployeeStatusSchema.enum.ACTIVE },
  TERMINATED: { key: 'reinstate', icon: UserCheckIcon, to: EmployeeStatusSchema.enum.ACTIVE },
} as const;

/** Employee cards: creation, activation code, position, status, Telegram relink (spec 2, FR-ID-*). */
export function EmployeesTab({ org }: { readonly org: OrgSnapshot }) {
  const [personnelNumber, setPersonnelNumber] = usePersistentState('employees.personnelNumber', '');
  const [fullName, setFullName] = usePersistentState('employees.fullName', '');
  const [email, setEmail] = usePersistentState('employees.email', '');
  const [phone, setPhone] = usePersistentState('employees.phone', '');
  const [telegramUsername, setTelegramUsername] = usePersistentState(
    'employees.telegramUsername',
    '',
  );
  const [birthDate, setBirthDate] = usePersistentState('employees.birthDate', '');
  const [newOrgUnitId, setNewOrgUnitId] = usePersistentState('employees.newOrgUnit', '');
  const [newPositionId, setNewPositionId] = usePersistentState('employees.newPosition', '');
  const [newTeamId, setNewTeamId] = usePersistentState('employees.newTeam', '');
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const checklistsQuery = useQuery({
    queryKey: keys.checklists,
    queryFn: () => checklistsApi.list(),
  });
  const checklists = checklistsQuery.data ?? null;
  /** Active checklists of a position: what the bot will ask this employee for (ADR-0012). */
  const checklistsOf = (positionId: string) =>
    (checklists ?? []).filter((c) => c.isActive && c.positions.some((p) => p.id === positionId));
  const [importing, setImporting] = useState<HTMLButtonElement | null>(null);
  const [statusFilter, setStatusFilter] = usePersistentState<'' | EmployeeView['status']>(
    'employees.status',
    '',
  );
  const [openId, setOpenId] = usePersistentState<string | null>('employees.openId', null);
  const [relinkFor, setRelinkFor] = useState<EmployeeView | null>(null);
  const { confirm, dialog } = useConfirm();
  const client = useQueryClient();
  const { state: session } = useSession();
  const roles = session.status === 'authenticated' ? session.me.roles : [];
  const writable = roles.some((grant) => grant.role === 'ADMIN' || grant.role === 'HR');
  const roster = useQuery(profileDirectoryOptions());
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

  // The server deletes a card without worked history and terminates one with history.
  const drop = useMutation({
    mutationFn: (v: { emp: EmployeeView; reason: string }) =>
      adminEmployeesApi.bulkDelete([v.emp.id], v.reason),
    onSuccess: async (result, v) => {
      if (result.deleted === 0) {
        notifySuccess(e.employeeArchived);
      } else {
        notifySuccess(e.employeeDeleted);
        if (openId === v.emp.id) setOpenId(null);
      }
      await reload();
    },
  });

  const issue = useMutation({
    mutationFn: (emp: EmployeeView) => adminEmployeesApi.issueCode(emp.id),
    onSuccess: (code) => setSheet([code]),
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
      birthDate,
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

  /** Delete with a reason; a card with worked history is terminated instead so its records stay. */
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

  function statusLabel(status: 'ACTIVE' | 'BLOCKED', reinstating: boolean) {
    if (reinstating) return e.reinstate;
    return status === 'BLOCKED' ? e.block : e.unblock;
  }

  async function changeStatus(emp: EmployeeView, status: 'ACTIVE' | 'BLOCKED') {
    // Coming back from a dismissal is its own action: it needs a new activation code, because the
    // dismissal released the Telegram account so the phone could be used on another card.
    const reinstating = status === 'ACTIVE' && emp.status === 'TERMINATED';
    const label = statusLabel(status, reinstating);
    const reason = await confirm({
      title: `${label}: ${emp.fullName}`,
      description: reinstating ? e.reinstateHint : hints.employeesStatus,
      confirmLabel: label,
      commentLabel: t.common.reason,
      commentRequired: true,
    });
    if (!reason) return;
    setStatus.mutate({ emp, status, reason });
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<ActivationCodeIssued[] | null>(null);
  const selectable = list.filter(
    (x) => canEditEmployee(x, org, roles) && selected.has(x.id) && x.status === 'ACTIVE',
  );

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
    const ids = list
      .filter((employee) => selected.has(employee.id) && canEditEmployee(employee, org, roles))
      .map((employee) => employee.id);
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
    add.error ?? drop.error ?? issue.error ?? setStatus.error ?? issueMany.error ?? dropMany.error,
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
      cell: (emp) => (
        <Link
          onClick={(event) => rememberEmployeeList(event.currentTarget, emp.id)}
          to="/administration/{-$tab}/{-$detail}"
          params={{ tab: 'employees', detail: emp.id }}
          replace
          resetScroll={false}
          className="flex min-w-0 items-center gap-2 rounded hover:underline focus-visible:outline-2"
        >
          <UserAvatar
            name={emp.fullName}
            email={emp.id}
            image={avatarUrl(emp.id, emp.avatarVersion)}
          />
          <span className="min-w-0 break-words">{emp.fullName}</span>
        </Link>
      ),
      sortValue: (emp) => emp.fullName,
    },
    {
      key: 'position',
      label: e.position,
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
      label: e.checklist,
      header: (
        <span className="inline-flex items-center gap-1">
          {e.checklist}
          <InfoTip text={hints.employeesChecklistColumn} />
        </span>
      ),
      cell: (emp) => {
        if (!emp.currentPosition) return <Muted>{e.noPosition}</Muted>;
        // Unknown until the list arrives: never claim a position has no checklist.
        if (checklists === null) return <Muted>—</Muted>;
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

  const statusAction = (emp: EmployeeView): RowAction => {
    const action = STATUS_ACTIONS[emp.status];
    return {
      key: action.key,
      label: e[action.key],
      icon: action.icon,
      disabled: busy,
      pending: setStatus.isPending && setStatus.variables.emp.id === emp.id,
      separator: true,
      onSelect: () => void changeStatus(emp, action.to),
    };
  };

  const rowActions = (emp: EmployeeView): RowAction[] => [
    {
      key: 'position',
      label: all.employeeProfile.title,
      icon: IdCardIcon,
      onSelect: () => setOpenId(openId === emp.id ? null : emp.id),
    },
    ...(canEditEmployee(emp, org, roles) && emp.status === 'ACTIVE'
      ? [
          {
            key: 'code',
            label: e.issueCode,
            icon: KeyRoundIcon,
            disabled: busy,
            pending: issue.isPending && issue.variables.id === emp.id,
            onSelect: () => issueCode(emp),
          },
        ]
      : []),
    ...(canEditEmployee(emp, org, roles) && emp.telegramLinked && emp.status === 'ACTIVE'
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
    ...(canEditEmployee(emp, org, roles) ? [statusAction(emp)] : []),
    ...(canEditEmployee(emp, org, roles)
      ? [
          {
            key: 'delete',
            label: e.deleteEmployee,
            icon: Trash2Icon,
            disabled: busy,
            pending: drop.isPending && drop.variables.emp.id === emp.id,
            destructive: true,
            separator: true,
            onSelect: () => void deleteEmployee(emp),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Section
        title={t.tabs.employees}
        hint={hints.employeesActivation}
        actions={
          writable ? (
            <>
              <IconButton
                icon={UploadIcon}
                label={e.import}
                tooltip={e.import}
                size="icon"
                variant="outline"
                onClick={(event) => setImporting(event.currentTarget)}
              />
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
                  <FormField label={e.birthDate} error={fieldErrors.birthDate} optional>
                    {(id) => (
                      <Input
                        id={id}
                        type="date"
                        value={birthDate}
                        autoComplete="off"
                        onChange={(ev) => setBirthDate(ev.target.value)}
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
                      pending={add.isPending}
                      disabled={busy || isBlank(personnelNumber) || isBlank(fullName)}
                    >
                      {t.common.add}
                    </Button>
                  </DialogFooter>
                </form>
              </AddDialog>
            </>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label={e.statusFilter}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v as '' | EmployeeView['status']);
              setSelected(new Set());
            }}
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
            onChange={(v) => {
              setTelegramFilter(v as '' | 'LINKED' | 'NOT_LINKED');
              setSelected(new Set());
            }}
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

      {(checklistsQuery.isError || checklistsQuery.fetchStatus === 'paused') && (
        <QueryFeedback query={checklistsQuery} />
      )}
      <DataTable
        queryState={roster}
        columns={columns}
        rows={visibleList}
        rowKey={(emp) => emp.id}
        searchText={(emp) =>
          `${emp.fullName} ${emp.personnelNumber} ${emp.email ?? ''} ${emp.phone ?? ''} ${emp.telegramUsername ?? ''}`
        }
        searchPlaceholder={e.search}
        activeKey={openId ?? employeeListReturnId()}
        empty={t.common.empty}
        storageKey="employees"
        caption={all.admin.sections.administration + ': ' + t.tabs.employees}
        primaryKey="name"
        detailTrigger="row-menu"
        rowLabel={(emp) => `${emp.fullName} · ${emp.personnelNumber}`}
        resetKey={`${statusFilter}:${telegramFilter}`}
        selectedKeys={writable ? selected : undefined}
        onSelectionChange={writable ? setSelected : undefined}
        selectionBar={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              pending={issueMany.isPending}
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
              pending={dropMany.isPending}
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
          writable ? (
            <Button type="button" variant="outline" onClick={() => setCreating(true)}>
              {e.create}
            </Button>
          ) : undefined
        }
        onRowClick={(emp) => {
          const main = document.querySelector('main');
          if (main) rememberEmployeeList(main, emp.id);
          setOpenId(emp.id);
        }}
        rowActions={rowActions}
        rowClassName={(emp) => (emp.status !== 'ACTIVE' ? 'text-muted-foreground' : undefined)}
      />
      {openId && <ProfileSheet employeeId={openId} onClose={() => setOpenId(null)} />}
      <CodeSheet codes={sheet} employees={list} onClose={() => setSheet(null)} />
      <ImportDialog
        open={importing !== null}
        returnFocusTo={importing}
        onOpenChange={(open) => {
          if (!open) setImporting(null);
        }}
        onImported={reload}
      />
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
            <Button type="submit" pending={busy} disabled={busy || !valid}>
              {e.relink}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PositionPanel({
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
  const now = history.dataUpdatedAt;
  const current =
    history.data?.find(
      (assignment) =>
        Date.parse(assignment.validFrom) <= now &&
        (assignment.validTo === null || Date.parse(assignment.validTo) > now),
    ) ?? null;
  const unitName = (id: string) => org.orgUnits.find((u) => u.id === id)?.name ?? id;
  const positionName = (id: string) => org.positions.find((p) => p.id === id)?.name ?? id;

  if (!history.data && (history.isPending || history.isError))
    return <QueryFeedback query={history} />;
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
      await client.invalidateQueries({ queryKey: keys.employees });
      onAssigned();
    },
  });
  const busy = move.isPending;
  const error = readError(move.error);

  function assign(ev: FormEvent) {
    ev.preventDefault();
    if (
      busy ||
      !orgUnitId ||
      !positionId ||
      (current &&
        isUnchanged(
          { orgUnitId, positionId, teamId: teamId || null },
          { orgUnitId: current.orgUnitId, positionId: current.positionId, teamId: current.teamId },
        ))
    )
      return;
    move.mutate();
  }

  return (
    <>
      <form className="flex flex-wrap items-end gap-3" onSubmit={assign}>
        <SelectField
          label={t.common.orgUnit}
          disabled={busy}
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
          disabled={busy}
          value={positionId}
          onChange={setPositionId}
          options={org.positions.map((p) => ({ value: p.id, label: p.name }))}
          className="w-56"
        />
        <SelectField
          label={t.common.team}
          disabled={busy}
          value={teamId}
          onChange={setTeamId}
          placeholder={t.common.none}
          options={teams.map((tm) => ({ value: tm.id, label: tm.name }))}
          className="w-48"
        />
        <Button
          type="submit"
          variant="secondary"
          pending={busy}
          disabled={
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
