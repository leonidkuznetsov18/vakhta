import type { EmployeeView, ShiftTemplateView, ZoneView } from '@vakhta/contracts';
import { monthDates } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import type { GridState } from './grid.ts';
import { currentLocale } from '../i18n.tsx';

const t = messages(currentLocale());

interface Props {
  readonly month: string;
  readonly grid: GridState;
  readonly employees: readonly EmployeeView[];
  readonly templates: readonly ShiftTemplateView[];
  readonly zones: readonly ZoneView[];
  readonly readOnly: boolean;
  readonly onCell: (employeeId: string, date: string, templateId: string) => void;
  readonly onZone: (employeeId: string, zoneId: string) => void;
  readonly onAdd: (employeeId: string) => void;
  readonly onRemove: (employeeId: string) => void;
}

function weekdayIndex(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 6 : d - 1;
}

/** Сітка «працівники × дні»: у комірці шаблон зміни, у рядку зона (ТЗ 9.1 «График»). */
export function ScheduleGrid({
  month,
  grid,
  employees,
  templates,
  zones,
  readOnly,
  onCell,
  onZone,
  onAdd,
  onRemove,
}: Props) {
  const days = monthDates(month);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const templateById = new Map(templates.map((tpl) => [tpl.id, tpl]));
  const inGrid = new Set(grid.rows.map((r) => r.employeeId));
  const available = employees.filter((e) => e.status === 'ACTIVE' && !inGrid.has(e.id));
  const s = t.admin.schedule;

  return (
    <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th className="sticky">{s.employee}</th>
            <th className="sticky zone-col">{s.zone}</th>
            {days.map((d) => {
              const wd = weekdayIndex(d);
              return (
                <th key={d} className={wd >= 5 ? 'weekend' : undefined}>
                  <div>{d.slice(8, 10)}</div>
                  <small>{t.schedule.weekdaysShort[wd]}</small>
                </th>
              );
            })}
            <th className="count-col">{s.shifts}</th>
            {!readOnly && <th />}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => {
            const emp = byId.get(row.employeeId);
            const count = Object.values(row.cells).filter(Boolean).length;
            return (
              <tr key={row.employeeId}>
                <td className="sticky">
                  <div className="emp">{emp?.fullName ?? row.employeeId}</div>
                  <small className="muted">{emp?.personnelNumber}</small>
                </td>
                <td className="sticky zone-col">
                  <select
                    value={row.zoneId}
                    disabled={readOnly}
                    onChange={(e) => onZone(row.employeeId, e.target.value)}
                    aria-label={s.zone}
                  >
                    <option value="">{s.noZone}</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </td>
                {days.map((d) => {
                  const templateId = row.cells[d] ?? '';
                  const tpl = templateId ? templateById.get(templateId) : undefined;
                  const cls = tpl ? (tpl.isNight ? 'cell night' : 'cell day') : 'cell';
                  return (
                    <td key={d} className={cls}>
                      <select
                        value={templateId}
                        disabled={readOnly}
                        onChange={(e) => onCell(row.employeeId, d, e.target.value)}
                        aria-label={`${emp?.fullName ?? ''} ${d}`}
                      >
                        <option value="">—</option>
                        {templates.map((tpl2) => (
                          <option key={tpl2.id} value={tpl2.id}>
                            {tpl2.code === 'DAY' ? 'Д' : tpl2.code === 'NIGHT' ? 'Н' : tpl2.code}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
                <td className="count-col">{count}</td>
                {!readOnly && (
                  <td>
                    <button
                      type="button"
                      className="link danger"
                      onClick={() => onRemove(row.employeeId)}
                    >
                      {s.remove}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
          {grid.rows.length === 0 && (
            <tr>
              <td colSpan={days.length + 4} className="muted empty">
                {s.emptyGrid}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!readOnly && available.length > 0 && (
        <div className="grid-add">
          <label>
            <span>{s.addEmployee}</span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onAdd(e.target.value);
              }}
            >
              <option value="">…</option>
              {available.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} · {e.personnelNumber}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
