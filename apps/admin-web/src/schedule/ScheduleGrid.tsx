import type { EmployeeView, ShiftTemplateView, ZoneView } from '@vakhta/contracts';
import { monthDates } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Paginator, usePages } from '@/components/app/data-table';
import { SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted } from '@/components/app/page';
import { cn } from 'cn';
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

/** "Employees × days" grid: a shift template per cell, a zone per row (spec 9.1 "Schedule"). */
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
  const pages = usePages(grid.rows.length, 25);
  const visible = grid.rows.slice((pages.page - 1) * pages.size, pages.page * pages.size);
  const dayKind = t.schedule.dayKinds;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-background">{s.employee}</TableHead>
              <TableHead className="min-w-40">
                <span className="inline-flex items-center gap-1">
                  {s.zone}
                  <InfoTip text={t.ui.hints.scheduleZone} />
                </span>
              </TableHead>
              {days.map((d) => {
                const wd = weekdayIndex(d);
                return (
                  <TableHead key={d} className={cn('px-1 text-center', wd >= 5 && 'bg-muted/60')}>
                    <div className="tabular-nums">{d.slice(8, 10)}</div>
                    <Muted>{t.schedule.weekdaysShort[wd]}</Muted>
                  </TableHead>
                );
              })}
              <TableHead className="text-right">{s.shifts}</TableHead>
              {!readOnly && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const emp = byId.get(row.employeeId);
              const count = Object.values(row.cells).filter(Boolean).length;
              return (
                <TableRow key={row.employeeId}>
                  <TableCell className="sticky left-0 z-10 bg-background">
                    <div className="font-medium">{emp?.fullName ?? row.employeeId}</div>
                    <Muted>{emp?.personnelNumber}</Muted>
                  </TableCell>
                  <TableCell>
                    <NativeSelect
                      size="sm"
                      className="w-full"
                      value={row.zoneId}
                      disabled={readOnly}
                      onChange={(e) => onZone(row.employeeId, e.target.value)}
                      aria-label={s.zone}
                    >
                      <NativeSelectOption value="">{s.noZone}</NativeSelectOption>
                      {zones.map((z) => (
                        <NativeSelectOption key={z.id} value={z.id}>
                          {z.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </TableCell>
                  {days.map((d) => {
                    const templateId = row.cells[d] ?? '';
                    const tpl = templateId ? templateById.get(templateId) : undefined;
                    return (
                      <TableCell
                        key={d}
                        className={cn(
                          'p-0.5 text-center',
                          tpl &&
                            (tpl.isNight
                              ? 'bg-indigo-50 dark:bg-indigo-950'
                              : 'bg-amber-50 dark:bg-amber-950'),
                        )}
                      >
                        <select
                          value={templateId}
                          disabled={readOnly}
                          onChange={(e) => onCell(row.employeeId, d, e.target.value)}
                          aria-label={`${emp?.fullName ?? ''} ${d}`}
                          className="h-7 w-9 rounded-md border border-transparent bg-transparent text-center text-sm transition-colors hover:border-border focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <option value="">{dayKind.OFF}</option>
                          {templates.map((tpl2) => (
                            <option key={tpl2.id} value={tpl2.id}>
                              {tpl2.code === 'DAY'
                                ? dayKind.DAY
                                : tpl2.code === 'NIGHT'
                                  ? dayKind.NIGHT
                                  : tpl2.code}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right tabular-nums">{count}</TableCell>
                  {!readOnly && (
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`${s.remove}: ${emp?.fullName ?? ''}`}
                        onClick={() => onRemove(row.employeeId)}
                      >
                        <XIcon aria-hidden="true" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {grid.rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={days.length + 4}
                  className="py-8 text-center text-muted-foreground"
                >
                  {s.emptyGrid}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Paginator pages={pages} total={grid.rows.length} />
      {!readOnly && available.length > 0 && (
        <SelectField
          label={s.addEmployee}
          value=""
          onChange={(v) => v && onAdd(v)}
          placeholder="…"
          options={available.map((e) => ({
            value: e.id,
            label: `${e.fullName} · ${e.personnelNumber}`,
          }))}
          className="w-80"
        />
      )}
    </div>
  );
}
