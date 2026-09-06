import { useEffect, useState, type FormEvent } from 'react';
import type {
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
import { DataTable, type Column, type RowAction } from '@/components/app/data-table';
import { Feedback, useAction } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, StatusPill, type Tone } from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { adminEmployeesApi, employeesApi } from '../api.ts';
import { currentLocale } from '../i18n.tsx';
import { usePersistentState } from '@/lib/persistent-state';
import { AddDialog } from '@/components/app/add-dialog';
import {
  BanIcon,
  CircleCheckIcon,
  IdCardIcon,
  KeyRoundIcon,
  Link2Icon,
  UserXIcon,
} from 'lucide-react';
import { DetailSheet } from '@/components/app/detail-sheet';
import { ImportDialog } from './ImportDialog.tsx';
import { QrCode } from '@/components/app/qr-code';
import { UploadIcon } from 'lucide-react';
import { validateWith, type FieldErrors } from '@/lib/validation';
import { CreateEmployeeCommand } from '@vakhta/contracts';
import { CodeSheet } from './CodeSheet.tsx';
import { PrinterIcon } from 'lucide-react';

const all = messages(currentLocale());
const t = all.admin.administration;
const e = t.employees;
const hints = all.ui.hints;
const STATUS_TONE: Record<EmployeeView['status'], Tone> = {
  ACTIVE: 'success',
  BLOCKED: 'warning',
  TERMINATED: 'neutral',
};

/** Employee cards: creation, activation code, position, status, Telegram relink (spec 2, FR-ID-*). */
export function EmployeesTab({ org }: { readonly org: OrgSnapshot }) {
  const [list, setList] = useState<EmployeeView[]>([]);
  const [personnelNumber, setPersonnelNumber] = usePersistentState('employees.personnelNumber', '');
  const [fullName, setFullName] = usePersistentState('employees.fullName', '');
  const [issued, setIssued] = useState<ActivationCodeIssued | null>(null);
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [importing, setImporting] = useState(false);
  const [statusFilter, setStatusFilter] = usePersistentState<'' | EmployeeView['status']>(
    'employees.status',
    '',
  );
  const [openId, setOpenId] = usePersistentState<string | null>('employees.openId', null);
  const [relinkFor, setRelinkFor] = useState<EmployeeView | null>(null);
  const { busy, error, run } = useAction();
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    void run(async () => setList(await employeesApi.list()));
  }, [run]);

  function replace(updated: EmployeeView) {
    setList((l) => l.map((x) => (x.id === updated.id ? updated : x)));
  }

  const unitName = (id: string) => org.orgUnits.find((u) => u.id === id)?.name ?? id;
  const positionName = (id: string) => org.positions.find((p) => p.id === id)?.name ?? id;

  function create(ev: FormEvent) {
    ev.preventDefault();
    const checked = validateWith(CreateEmployeeCommand, {
      personnelNumber,
      fullName,
      status: 'ACTIVE',
    });
    setFieldErrors(checked.errors);
    if (!checked.ok) return;
    void run(async () => {
      const created = await adminEmployeesApi.create(checked.data);
      setList((l) => [created, ...l]);
      setPersonnelNumber('');
      setFullName('');
      setCreating(false);
    }, t.common.added);
  }

  function issueCode(emp: EmployeeView) {
    void run(async () => setIssued(await adminEmployeesApi.issueCode(emp.id)));
  }

  async function changeStatus(emp: EmployeeView, status: EmployeeView['status']) {
    const label = status === 'BLOCKED' ? e.block : status === 'ACTIVE' ? e.unblock : e.terminate;
    const reason = await confirm({
      title: `${label}: ${emp.fullName}`,
      description: hints.employeesStatus,
      confirmLabel: label,
      commentLabel: t.common.reason,
      commentRequired: true,
      destructive: status === 'TERMINATED',
    });
    if (!reason) return;
    void run(
      async () => replace(await adminEmployeesApi.changeStatus(emp.id, { status, reason })),
      e.statusChanged,
    );
  }

  const openEmployee = list.find((x) => x.id === openId) ?? null;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<ActivationCodeIssued[] | null>(null);
  const selectable = list.filter((x) => selected.has(x.id) && x.status === 'ACTIVE');

  function issueSelected() {
    if (selectable.length === 0) return;
    void run(
      async () => {
        const codes = await adminEmployeesApi.issueCodes(selectable.map((x) => x.id));
        setSheet(codes);
        setSelected(new Set());
      },
      format(e.codesIssued, { n: selectable.length }),
    );
  }
  const visibleList = statusFilter ? list.filter((x) => x.status === statusFilter) : list;

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
  ];

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
                <FormField label={e.personnelNumber} error={fieldErrors.personnelNumber}>
                  {(id) => (
                    <Input
                      id={id}
                      value={personnelNumber}
                      onChange={(ev) => setPersonnelNumber(ev.target.value)}
                    />
                  )}
                </FormField>
                <FormField label={e.fullName} error={fieldErrors.fullName}>
                  {(id) => (
                    <Input
                      id={id}
                      value={fullName}
                      onChange={(ev) => setFullName(ev.target.value)}
                    />
                  )}
                </FormField>
                <Feedback error={error} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                    {t.common.cancel}
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {t.common.add}
                  </Button>
                </DialogFooter>
              </form>
            </AddDialog>
          </>
        }
      >
        <SelectField
          label={e.statusFilter}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as '' | EmployeeView['status'])}
          placeholder={all.ui.common.reset}
          options={(['ACTIVE', 'BLOCKED', 'TERMINATED'] as const).map((st) => ({
            value: st,
            label: e.statuses[st],
          }))}
          className="w-56"
        />
        <Feedback error={error} />
        {issued && (
          <Alert>
            <AlertTitle>
              {format(e.codeIssued, {
                code: issued.code,
                expires: formatDateTime(issued.expiresAt),
              })}
            </AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap items-start gap-4">
                <QrCode value={issued.deepLink} size={160} label={e.deepLink} />
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{e.deepLink}:</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {issued.deepLink}
                    </code>
                    <CopyButton value={issued.deepLink} />
                  </div>
                  <Muted className="flex items-center gap-1">
                    {e.qrHint}
                    <InfoTip text={hints.employeesQr} />
                  </Muted>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </Section>

      <DataTable
        columns={columns}
        rows={visibleList}
        rowKey={(emp) => emp.id}
        searchText={(emp) => `${emp.fullName} ${emp.personnelNumber}`}
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
          </div>
        }
        loading={busy && list.length === 0}
        emptyAction={
          <Button type="button" variant="outline" onClick={() => setCreating(true)}>
            {e.create}
          </Button>
        }
        onRowClick={(emp) => setOpenId(openId === emp.id ? null : emp.id)}
        rowActions={rowActions}
        rowClassName={(emp) => (emp.status !== 'ACTIVE' ? 'text-muted-foreground' : undefined)}
      />
      {openEmployee && (
        <DetailSheet
          open
          onOpenChange={(open) => !open && setOpenId(null)}
          title={openEmployee.fullName}
          description={`${openEmployee.personnelNumber} · ${e.statuses[openEmployee.status]}`}
        >
          <PositionPanel
            employee={openEmployee}
            org={org}
            onAssigned={(view) =>
              replace({
                ...openEmployee,
                currentPosition: {
                  positionId: view.positionId,
                  orgUnitId: view.orgUnitId,
                  teamId: view.teamId,
                },
              })
            }
          />
        </DetailSheet>
      )}
      <CodeSheet codes={sheet} employees={list} onClose={() => setSheet(null)} />
      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        onImported={async () => {
          setList(await employeesApi.list());
        }}
      />
      {dialog}
      <RelinkDialog
        employee={relinkFor}
        onClose={() => setRelinkFor(null)}
        onRelinked={(emp) => {
          replace({ ...emp, telegramLinked: true });
          setRelinkFor(null);
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
  readonly onRelinked: (employee: EmployeeView) => void;
}) {
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const telegramUserId = Number(userId);
  const valid = Number.isInteger(telegramUserId) && telegramUserId > 0 && reason.trim().length >= 3;

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!employee || !valid) return;
    void run(async () => {
      await adminEmployeesApi.relink(employee.id, { telegramUserId, reason: reason.trim() });
      onRelinked(employee);
      setUserId('');
      setReason('');
    });
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
  readonly onAssigned: (view: EmployeePositionView) => void;
}) {
  const [history, setHistory] = useState<EmployeePositionView[] | null>(null);
  const [orgUnitId, setOrgUnitId] = useState(org.orgUnits[0]?.id ?? '');
  const [positionId, setPositionId] = useState(org.positions[0]?.id ?? '');
  const [teamId, setTeamId] = useState('');
  const { busy, error, run } = useAction();

  useEffect(() => {
    void run(async () => setHistory(await adminEmployeesApi.positions(employee.id)));
  }, [employee.id, run]);

  const current = history?.find((h) => h.validTo === null) ?? null;
  // Open the form on the assignment in force, so "save" without changes is not a silent transfer.
  useEffect(() => {
    if (!current) return;
    setOrgUnitId(current.orgUnitId);
    setPositionId(current.positionId);
    setTeamId(current.teamId ?? '');
  }, [current]);
  const unitName = (id: string) => org.orgUnits.find((u) => u.id === id)?.name ?? id;
  const positionName = (id: string) => org.positions.find((p) => p.id === id)?.name ?? id;
  const teams = org.teams.filter((tm) => tm.orgUnitId === orgUnitId);

  function assign(ev: FormEvent) {
    ev.preventDefault();
    void run(async () => {
      const view = await adminEmployeesApi.assignPosition(employee.id, {
        orgUnitId,
        positionId,
        ...(teamId ? { teamId } : {}),
      });
      setHistory((h) => [
        view,
        ...(h ?? []).map((x) => (x.validTo === null ? { ...x, validTo: view.validFrom } : x)),
      ]);
      onAssigned(view);
    }, e.positionAssigned);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1 text-sm">
        <strong>{e.currentPosition}:</strong>{' '}
        {current
          ? `${positionName(current.positionId)}, ${unitName(current.orgUnitId)}`
          : e.noPosition}
        <InfoTip text={hints.employeesPosition} />
      </p>
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
        <Button type="submit" variant="secondary" disabled={busy || !orgUnitId || !positionId}>
          {e.assignPosition}
        </Button>
      </form>
      <Feedback error={error} />
    </div>
  );
}
