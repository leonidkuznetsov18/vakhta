import { useMutation } from '@tanstack/react-query';
import { format, messages } from '@vakhta/i18n';
import type { RetrospectiveRow } from '@vakhta/contracts';
import { currentLocale } from '@/i18n';
import { formatDuration } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { InfoTip } from '@/components/app/info-tip';
import { QueryFeedback } from '@/components/app/query-feedback';
import { CalendarDetailPanel } from '@/shared/ui/resource-calendar';
import { LoadingState } from '@/shared/ui/loading-state';
import { readError } from '@/errors';
import { recordedTime } from '../lib/labels';
import type { Workspace } from '../model/use-workspace';
import { useRetrospective } from '../model/use-retrospective';
import { retrospectiveApi, saveBlob } from '../api/retrospective-api';
import { employeeLabel } from './assignment-changes';

const t = messages(currentLocale()).scheduleWorkspace;
const s = messages(currentLocale()).admin.schedule;

/** Effective plan next to recorded evidence (SC-41) with a formula-safe export (SC-43). */
export function RetrospectiveSheet({
  workspace: w,
  open,
  onClose,
  onRestoreFocus,
}: {
  readonly workspace: Workspace;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onRestoreFocus: () => void;
}) {
  const query = useRetrospective({
    accessKey: w.accessKey,
    siteId: w.siteId,
    orgUnitId: w.orgUnitId,
    month: w.month,
    enabled: open,
  });
  const download = useMutation({
    mutationFn: () =>
      retrospectiveApi.download({ siteId: w.siteId, orgUnitId: w.orgUnitId, periodMonth: w.month }),
    retry: false,
    networkMode: 'always',
    onSuccess: (blob) => saveBlob(blob, `vakhta-retrospective-${w.orgUnitId}-${w.month}.xlsx`),
  });
  const view = query.data;
  const departure = (row: RetrospectiveRow) =>
    row.departure === 'RECORDED'
      ? t.departureRecorded
      : row.departure === 'UNKNOWN'
        ? t.departureUnknown
        : t.departureNone;
  return (
    <CalendarDetailPanel
      open={open}
      title={t.retrospective}
      description={w.month}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      wide
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <InfoTip text={t.retrospectiveHint} />
          <Button
            variant="outline"
            size="sm"
            disabled={!view?.version || download.isPending}
            onClick={() => download.mutate()}
          >
            {t.downloadRetrospective}
          </Button>
          {download.isPending && <LoadingState label={t.downloadRetrospective} />}
        </div>
        {download.error && <Feedback error={readError(download.error)} />}
        <QueryFeedback query={query} errorMessage={t.presenceUnavailable} />
        {view && !view.version && (
          <p className="text-sm text-muted-foreground">{t.retrospectiveEmpty}</p>
        )}
        {view?.version && (
          <p className="text-sm text-muted-foreground">
            {format(t.retrospectiveVersion, {
              no: view.version.versionNo,
              time: view.version.publishedAt
                ? recordedTime(view.version.publishedAt, w.timezone)
                : '—',
              timezone: view.timezone,
              generated: recordedTime(view.generatedAt, w.timezone),
            })}
          </p>
        )}
        {view && (
          <DataTable
            columns={[
              {
                key: 'employee',
                header: s.employee,
                cell: (row) => employeeLabel(w, row.employeeId),
              },
              {
                key: 'shifts',
                header: t.evidenceBreakdown,
                cell: (row) =>
                  `${row.shifts} (${row.recordedShifts} · ${row.unknownDepartures} · ${row.missingActuals})`,
              },
              {
                key: 'planned',
                header: t.plannedTime,
                cell: (row) => formatDuration(row.plannedMinutes),
              },
              {
                key: 'work',
                header: t.recordedWork,
                cell: (row) => formatDuration(row.workMinutes),
              },
            ]}
            rows={view.totals}
            rowKey={(row) => row.employeeId}
            empty={t.retrospectiveEmpty}
            pageSize={20}
          />
        )}
        {view && view.rows.length > 0 && (
          <DataTable
            columns={[
              { key: 'date', header: t.date, cell: (row) => row.businessDate },
              {
                key: 'employee',
                header: s.employee,
                cell: (row) => employeeLabel(w, row.employeeId),
              },
              {
                key: 'planned',
                header: t.plannedTime,
                cell: (row) => formatDuration(row.plannedMinutes),
              },
              {
                key: 'work',
                header: t.recordedWork,
                cell: (row) => (row.workMinutes === null ? '—' : formatDuration(row.workMinutes)),
              },
              { key: 'departure', header: t.departureRecorded, cell: (row) => departure(row) },
            ]}
            rows={view.rows}
            rowKey={(row) => row.assignmentId}
            empty={t.retrospectiveEmpty}
            pageSize={20}
          />
        )}
      </div>
    </CalendarDetailPanel>
  );
}
