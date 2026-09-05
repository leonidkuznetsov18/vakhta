import React, { useEffect, useState } from 'react';
import type {
  ActivationCodeIssued,
  EmployeePositionView,
  EmployeeView,
  OrgSnapshot,
} from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { adminEmployeesApi, employeesApi } from '../api.ts';
import { CopyButton, Feedback, Field, useAction } from './ui.tsx';

const t = messages('ru').admin.administration;
const e = t.employees;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

/** Картки працівників: створення, код активації, посада, статус, зміна Telegram (ТЗ 2, FR-ID-*). */
export function EmployeesTab({ org }: { readonly org: OrgSnapshot }) {
  const [list, setList] = useState<EmployeeView[]>([]);
  const [personnelNumber, setPersonnelNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [issued, setIssued] = useState<ActivationCodeIssued | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { busy, error, notice, run } = useAction();

  useEffect(() => {
    void run(async () => setList(await employeesApi.list()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function replace(updated: EmployeeView) {
    setList((l) => l.map((x) => (x.id === updated.id ? updated : x)));
  }

  function create(ev: React.FormEvent) {
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

  function changeStatus(emp: EmployeeView, status: EmployeeView['status']) {
    const reason = window.prompt(t.common.reason)?.trim();
    if (!reason) return;
    void run(
      async () => replace(await adminEmployeesApi.changeStatus(emp.id, { status, reason })),
      e.statusChanged,
    );
  }

  function relink(emp: EmployeeView) {
    const idText = window.prompt(e.relinkUserId)?.trim();
    const telegramUserId = Number(idText);
    if (!idText || !Number.isInteger(telegramUserId) || telegramUserId <= 0) return;
    const reason = window.prompt(t.common.reason)?.trim();
    if (!reason) return;
    void run(async () => {
      await adminEmployeesApi.relink(emp.id, { telegramUserId, reason });
      replace({ ...emp, telegramLinked: true });
    }, e.relinked);
  }

  return (
    <div>
      <form className="inline-form" onSubmit={create}>
        <Field label={e.personnelNumber}>
          <input
            value={personnelNumber}
            onChange={(ev) => setPersonnelNumber(ev.target.value)}
            required
            maxLength={32}
          />
        </Field>
        <Field label={e.fullName}>
          <input
            value={fullName}
            onChange={(ev) => setFullName(ev.target.value)}
            required
            minLength={3}
            maxLength={200}
          />
        </Field>
        <button type="submit" className="btn primary" disabled={busy}>
          {e.create}
        </button>
      </form>
      <Feedback error={error} notice={notice} />
      {issued && (
        <div className="notice code-issued">
          <div>
            {format(e.codeIssued, { code: issued.code, expires: fmtDate(issued.expiresAt) })}
          </div>
          <div>
            {e.deepLink}: <code>{issued.deepLink}</code> <CopyButton value={issued.deepLink} />
          </div>
        </div>
      )}
      {list.length === 0 ? (
        <p className="muted">{t.common.empty}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{e.personnelNumber}</th>
              <th>{e.fullName}</th>
              <th>{e.status}</th>
              <th>{e.telegram}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((emp) => (
              <React.Fragment key={emp.id}>
                <tr className={emp.status !== 'ACTIVE' ? 'muted' : undefined}>
                  <td>{emp.personnelNumber}</td>
                  <td>{emp.fullName}</td>
                  <td>{e.statuses[emp.status]}</td>
                  <td>{emp.telegramLinked ? e.linked : e.notLinked}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="link"
                      onClick={() => setOpenId(openId === emp.id ? null : emp.id)}
                    >
                      {e.position}
                    </button>
                    {emp.status === 'ACTIVE' && (
                      <button
                        type="button"
                        className="link"
                        disabled={busy}
                        onClick={() => issueCode(emp)}
                      >
                        {e.issueCode}
                      </button>
                    )}
                    {emp.telegramLinked && emp.status === 'ACTIVE' && (
                      <button
                        type="button"
                        className="link"
                        disabled={busy}
                        onClick={() => relink(emp)}
                      >
                        {e.relink}
                      </button>
                    )}
                    {emp.status === 'ACTIVE' && (
                      <button
                        type="button"
                        className="link"
                        disabled={busy}
                        onClick={() => changeStatus(emp, 'BLOCKED')}
                      >
                        {e.block}
                      </button>
                    )}
                    {emp.status === 'BLOCKED' && (
                      <button
                        type="button"
                        className="link"
                        disabled={busy}
                        onClick={() => changeStatus(emp, 'ACTIVE')}
                      >
                        {e.unblock}
                      </button>
                    )}
                    {emp.status !== 'TERMINATED' && (
                      <button
                        type="button"
                        className="link danger"
                        disabled={busy}
                        onClick={() => changeStatus(emp, 'TERMINATED')}
                      >
                        {e.terminate}
                      </button>
                    )}
                  </td>
                </tr>
                {openId === emp.id && (
                  <tr>
                    <td colSpan={5}>
                      <PositionPanel employee={emp} org={org} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PositionPanel({
  employee,
  org,
}: {
  readonly employee: EmployeeView;
  readonly org: OrgSnapshot;
}) {
  const [history, setHistory] = useState<EmployeePositionView[] | null>(null);
  const [orgUnitId, setOrgUnitId] = useState(org.orgUnits[0]?.id ?? '');
  const [positionId, setPositionId] = useState(org.positions[0]?.id ?? '');
  const [teamId, setTeamId] = useState('');
  const { busy, error, notice, run } = useAction();

  useEffect(() => {
    void run(async () => setHistory(await adminEmployeesApi.positions(employee.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  const current = history?.find((h) => h.validTo === null) ?? null;
  const unitName = (id: string) => org.orgUnits.find((u) => u.id === id)?.name ?? id;
  const positionName = (id: string) => org.positions.find((p) => p.id === id)?.name ?? id;
  const teams = org.teams.filter((tm) => tm.orgUnitId === orgUnitId);

  function assign(ev: React.FormEvent) {
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
    }, e.positionAssigned);
  }

  return (
    <div className="subpanel">
      <p>
        <strong>{e.currentPosition}:</strong>{' '}
        {current
          ? `${positionName(current.positionId)}, ${unitName(current.orgUnitId)}`
          : e.noPosition}
      </p>
      <form className="inline-form" onSubmit={assign}>
        <Field label={t.common.orgUnit}>
          <select
            value={orgUnitId}
            onChange={(ev) => {
              setOrgUnitId(ev.target.value);
              setTeamId('');
            }}
          >
            {org.orgUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={e.position}>
          <select value={positionId} onChange={(ev) => setPositionId(ev.target.value)}>
            {org.positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.common.team}>
          <select value={teamId} onChange={(ev) => setTeamId(ev.target.value)}>
            <option value="">{t.common.none}</option>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className="btn" disabled={busy || !orgUnitId || !positionId}>
          {e.assignPosition}
        </button>
      </form>
      <Feedback error={error} notice={notice} />
    </div>
  );
}
