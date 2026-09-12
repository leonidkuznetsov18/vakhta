import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ImportEmployeesResult } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { DownloadIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/shared/ui/icon-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { FormField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, ROW_DANGER, StatusPill } from '@/components/app/page';
import { employeesFromCsv, type EmployeeRow } from '@/lib/csv';
import { adminEmployeesApi } from '../api.ts';
import { readError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';

const all = messages(currentLocale());
const t = all.admin.administration;
const e = t.employees;

const TEMPLATE = `${e.personnelNumber};${e.fullName}\n0001;Иванов Иван Иванович\n0002;Петрова Анна Сергеевна\n`;

/** CSV import of employee cards: pick a file, check the preview, import, read the report. */
export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onImported: () => Promise<void>;
}) {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportEmployeesResult | null>(null);
  const valid = rows.filter((r) => r.error === null);
  const invalid = rows.length - valid.length;

  async function pick(file: File | undefined) {
    setResult(null);
    if (!file) {
      setRows([]);
      setFileName('');
      return;
    }
    setFileName(file.name);
    setRows(employeesFromCsv(await file.text(), e.importReasons.INVALID));
  }

  // The report below is the feedback; no toast needed.
  const send = useMutation({
    mutationFn: () =>
      adminEmployeesApi.importMany({
        items: valid.map((r) => ({ personnelNumber: r.personnelNumber, fullName: r.fullName })),
      }),
    onSuccess: async (res) => {
      setResult(res);
      setRows([]);
      await onImported();
    },
  });
  const busy = send.isPending;
  const error = readError(send.error);

  function reset(next: boolean) {
    if (!next) {
      setRows([]);
      setFileName('');
      setResult(null);
    }
    onOpenChange(next);
  }

  const columns: Column<EmployeeRow>[] = [
    { key: 'line', header: '#', cell: (r) => <span className="tabular-nums">{r.line}</span> },
    {
      key: 'number',
      header: e.personnelNumber,
      cell: (r) => <span className="tabular-nums">{r.personnelNumber || '—'}</span>,
    },
    { key: 'name', header: e.fullName, cell: (r) => r.fullName || '—' },
    {
      key: 'check',
      header: e.status,
      cell: (r) =>
        r.error ? (
          <StatusPill tone="danger">{r.error}</StatusPill>
        ) : (
          <StatusPill tone="success">{all.ui.common.yes}</StatusPill>
        ),
    },
  ];

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent('\uFEFF' + TEMPLATE)}`;

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1">
            {e.import}
            <InfoTip text={all.ui.hints.employeesImport} />
          </DialogTitle>
          <DialogDescription>{e.importHint}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <FormField label={e.importFile} className="min-w-64 flex-1">
              {(id) => (
                <Input
                  id={id}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(ev) => void pick(ev.target.files?.[0])}
                />
              )}
            </FormField>
            <IconButton
              icon={DownloadIcon}
              label={e.importTemplate}
              tooltip={e.importTemplate}
              size="icon"
              asChild
              variant="outline"
            >
              <a href={templateHref} download="employees.csv">
                <span className="sr-only">{e.importTemplate}</span>
              </a>
            </IconButton>
          </div>
          {rows.length > 0 && (
            <>
              <Muted>
                {fileName} · {format(e.importSummary, { rows: valid.length, invalid })}
              </Muted>
              <DataTable
                storageKey="employee-import-preview"
                columns={columns}
                rows={rows}
                rowKey={(r) => String(r.line)}
                empty={t.common.empty}
                pageSize={10}
                caption={e.importPreview}
                rowClassName={(r) => (r.error ? ROW_DANGER : undefined)}
              />
            </>
          )}
          {result && (
            <Alert>
              <AlertTitle>
                {format(e.importDone, { created: result.created, skipped: result.skipped.length })}
              </AlertTitle>
              {result.skipped.length > 0 && (
                <AlertDescription>
                  <p className="font-medium">{e.importSkippedTitle}</p>
                  <ul className="list-disc pl-4">
                    {result.skipped.map((s) => (
                      <li key={s.personnelNumber}>
                        <span className="tabular-nums">{s.personnelNumber}</span> ·{' '}
                        {e.importReasons[s.reason]}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              )}
            </Alert>
          )}
          <Feedback error={error} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => reset(false)}>
            {all.ui.common.close}
          </Button>
          <Button type="button" disabled={busy || valid.length === 0} onClick={() => send.mutate()}>
            {e.importRun} ({valid.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
