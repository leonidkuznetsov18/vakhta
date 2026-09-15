import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand';
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
import { employeeCsvTemplate, type EmployeeRow } from '../model/preview';
import { createFileSelection } from '../model/file-selection';
import { LoadingState } from '@/shared/ui/loading-state';
import { importEmployees } from '../api/import-employees';
import { readError } from '@/errors';
import { currentLocale } from '@/i18n';

const all = messages(currentLocale());
const t = all.admin.administration;
const e = t.employees;

const IMPORT_MUTATION_KEY = ['employee-import'];
interface ImportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onImported: () => Promise<void>;
  readonly returnFocusTo?: HTMLElement | null;
}

/** Each opening owns a fresh file selection and mutation report. */
export function ImportDialog(props: ImportDialogProps) {
  return props.open ? <ImportSession {...props} /> : null;
}

function ImportSession({ onOpenChange, onImported, returnFocusTo }: ImportDialogProps) {
  const [selection] = useState(createFileSelection);
  const state = useStore(selection.store);
  const [ownLifecycle] = useState(() => (node: HTMLDivElement | null) => {
    if (node) return () => selection.reset();
  });
  const client = useQueryClient();
  const send = useMutation({
    mutationKey: IMPORT_MUTATION_KEY,
    mutationFn: importEmployees,
    retry: false,
    onSuccess: async () => {
      selection.reset();
      await onImported();
    },
  });
  const busy = send.isPending;
  const preview = state.status === 'ready' ? state.preview : null;
  const rows = preview?.rows ?? [];
  const count = preview?.command?.items.length ?? 0;
  const result = send.data;
  const error = state.status === 'error' ? e.importReadErrors[state.error] : readError(send.error);

  function pick(file: File | undefined) {
    if (client.isMutating({ mutationKey: IMPORT_MUTATION_KEY })) return;
    send.reset();
    void selection.select(file);
  }
  function submit() {
    if (client.isMutating({ mutationKey: IMPORT_MUTATION_KEY })) return;
    const current = selection.store.getState();
    if (current.status === 'ready' && current.preview.command) send.mutate(current.preview.command);
  }
  function reset(next: boolean) {
    if (client.isMutating({ mutationKey: IMPORT_MUTATION_KEY })) return;
    if (!next) selection.reset();
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
          <StatusPill tone="danger">{e.importReasons.INVALID}</StatusPill>
        ) : (
          <StatusPill tone="success">{all.ui.common.yes}</StatusPill>
        ),
    },
  ];

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(employeeCsvTemplate(e.personnelNumber, e.fullName, e.importExampleName))}`;

  return (
    <Dialog open onOpenChange={reset}>
      <DialogContent
        ref={ownLifecycle}
        onCloseAutoFocus={(event) => {
          if (returnFocusTo?.isConnected) {
            event.preventDefault();
            returnFocusTo.focus();
          }
        }}
        showCloseButton={!busy}
        className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1">
            {e.import}
            <InfoTip text={all.ui.hints.employeesImport} />
          </DialogTitle>
          <DialogDescription>{e.importHint}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <div className="flex flex-wrap items-end gap-3">
            <FormField label={e.importFile} className="min-w-0 basis-64 flex-1">
              {(id) => (
                <Input
                  id={id}
                  type="file"
                  accept=".csv,text/csv"
                  disabled={busy}
                  onChange={(ev) => {
                    pick(ev.target.files?.[0]);
                    ev.target.value = '';
                  }}
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
          {state.status === 'reading' && <LoadingState label={e.importReading} />}
          {preview && rows.length === 0 && <p role="status">{e.importEmpty}</p>}
          {rows.length > 0 && (
            <>
              <Muted>
                {state.status === 'ready' ? state.fileName : ''} ·{' '}
                {format(e.importSummary, { rows: count, invalid: preview?.invalidCount ?? 0 })}
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
          <Button type="button" variant="outline" disabled={busy} onClick={() => reset(false)}>
            {all.ui.common.close}
          </Button>
          <Button type="button" disabled={busy || count === 0} onClick={submit}>
            {busy ? <LoadingState label={all.ui.common.saving} /> : `${e.importRun} (${count})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
