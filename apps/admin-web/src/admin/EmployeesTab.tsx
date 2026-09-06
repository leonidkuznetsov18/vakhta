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
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback, useAction } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, StatusPill, type Tone } from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { adminEmployeesApi, employeesApi } from '../api.ts';
import { currentLocale } from '../i18n.tsx';

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
  const [personnelNumber, setPersonnelNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [issued, setIssued] = useState<ActivationCodeIssued | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [relinkFor, setRelinkFor] = useState<EmployeeView | null>(null);
  const { busy, error, notice, run } = useAction();
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
    void run(async () => {
      const created = await adminEmployeesApi.create({
        personnelNumber,
        fullName,
        status: 'ACTIVE',
      });
      setList((l) => [created, ...l]);
      setPersonnelNumber('');
      setFullName('');
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

  const columns: Column<EmployeeView>[] = [
    {
      key: 'number',
      header: e.personnelNumber,
      cell: (emp) => <span className="tabular-nums">{emp.personnelNumber}</span>,
    },
    { key: 'name', header: e.fullName, cell: (emp) => emp.fullName },
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
    {
      key: 'actions',
      header: <span className="sr-only">{all.ui.common.actions}</span>,
      align: 'right',
      cell: (emp) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpenId(openId === emp.id ? null : emp.id)}
          >
            {e.position}
          </Button>
          {emp.status === 'ACTIVE' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => issueCode(emp)}
            >
              {e.issueCode}
            </Button>
          )}
          {emp.telegramLinked && emp.status === 'ACTIVE' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setRelinkFor(emp)}
            >
              {e.relink}
            </Button>
          )}
          {emp.status === 'ACTIVE' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void changeStatus(emp, 'BLOCKED')}
            >
              {e.block}
            </Button>
          )}
          {emp.status === 'BLOCKED' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void changeStatus(emp, 'ACTIVE')}
            >
              {e.unblock}
            </Button>
          )}
          {emp.status !== 'TERMINATED' && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => void changeStatus(emp, 'TERMINATED')}
            >
              {e.terminate}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Section title={e.create} hint={hints.employeesActivation}>
        <form className="flex flex-wrap items-end gap-3" onSubmit={create}>
          <FormField label={e.personnelNumber} className="w-40">
            {(id) => (
              <Input
                id={id}
                value={personnelNumber}
                onChange={(ev) => setPersonnelNumber(ev.target.value)}
                required
                maxLength={32}
              />
            )}
          </FormField>
          <FormField label={e.fullName} className="min-w-64 flex-1">
            {(id) => (
              <Input
                id={id}
                value={fullName}
                onChange={(ev) => setFullName(ev.target.value)}
                required
                minLength={3}
                maxLength={200}
              />
            )}
          </FormField>
          <Button type="submit" disabled={busy}>
            {e.create}
          </Button>
        </form>
        <Feedback error={error} notice={notice} />
        {issued && (
          <Alert>
            <AlertTitle>
              {format(e.codeIssued, {
                code: issued.code,
                expires: formatDateTime(issued.expiresAt),
              })}
            </AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap items-center gap-2">
                <span>{e.deepLink}:</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{issued.deepLink}</code>
                <CopyButton value={issued.deepLink} />
              </div>
            </AlertDescription>
          </Alert>
        )}
      </Section>

      <DataTable
        columns={columns}
        rows={list}
        rowKey={(emp) => emp.id}
        empty={t.common.empty}
        rowClassName={(emp) => (emp.status !== 'ACTIVE' ? 'text-muted-foreground' : undefined)}
        expanded={(emp) =>
          openId === emp.id ? (
            <PositionPanel
              employee={emp}
              org={org}
              onAssigned={(view) =>
                replace({
                  ...emp,
                  currentPosition: {
                    positionId: view.positionId,
                    orgUnitId: view.orgUnitId,
                    teamId: view.teamId,
                  },
                })
              }
            />
          ) : null
        }
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
  const { busy, error, notice, run } = useAction();

  useEffect(() => {
    void run(async () => setHistory(await adminEmployeesApi.positions(employee.id)));
  }, [employee.id, run]);

  const current = history?.find((h) => h.validTo === null) ?? null;
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
      <Feedback error={error} notice={notice} />
    </div>
  );
}
