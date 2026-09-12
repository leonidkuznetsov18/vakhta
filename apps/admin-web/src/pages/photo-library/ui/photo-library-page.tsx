import { RotateCcwIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { PhotoInspectionDialog } from '@/features/photo-inspection';
import { DataTable, type Column } from '@/components/app/data-table';
import { HowItWorks } from '@/components/app/how-it-works';
import { Toolbar } from '@/components/app/page';
import { FormField, SelectField } from '@/components/app/fields';
import { DateField } from '@/components/app/date-picker';
import { QueryFeedback } from '@/components/app/query-feedback';
import { TableSearch } from '@/shared/ui/table-search';
import { PhotoThumb } from '@/components/app/photo';
import { InfoTip } from '@/components/app/info-tip';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/shared/ui/icon-button';
import { formatDate, formatDateTime } from '@/lib/format';
import type { PhotoLibraryEntry } from '@vakhta/contracts';
import { useLibrary } from '../model/use-library';
import { libraryApi } from '../api/library-api';

export function PhotoLibraryPage() {
  const model = useLibrary();
  const messagesForLocale = messages(currentLocale());
  const t = messagesForLocale.photoLibrary;
  const inspection = messagesForLocale.photoInspection;
  const columns: Column<PhotoLibraryEntry>[] = [
    {
      key: 'photo',
      header: t.photo,
      minWidth: '8rem',
      cell: (row) => (
        <div className="w-28 max-w-full max-md:w-48">
          <PhotoThumb
            media={row.photo.media}
            label={row.photo.label}
            loadLink={() => libraryApi.link(row)}
            onOpen={() => model.select(row)}
          />
        </div>
      ),
    },
    {
      key: 'status',
      header: t.assessment,
      minWidth: '10rem',
      cell: (row) => (
        <div className="space-y-2">
          <Badge variant={row.status === 'PROBLEMS' ? 'destructive' : 'secondary'}>
            {inspection.statuses[row.status]}
          </Badge>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t.regions}: {row.annotationCount}
          </p>
          {row.archived && <p className="text-xs text-muted-foreground">{t.archived}</p>}
        </div>
      ),
    },
    {
      key: 'aiFeedback',
      header: (
        <span className="inline-flex items-center gap-1.5">
          {t.aiFeedback}
          <InfoTip text={t.aiFeedbackHint} />
        </span>
      ),
      label: t.aiFeedback,
      minWidth: '9rem',
      cell: (row) =>
        row.aiFeedback ? (
          <span className="text-sm">{inspection.feedbackRatings[row.aiFeedback]}</span>
        ) : (
          <span className="text-sm text-muted-foreground">{t.aiFeedbackUnset}</span>
        ),
    },
    {
      key: 'date',
      header: t.date,
      minWidth: '6rem',
      className: 'whitespace-nowrap',
      cell: (row) => formatDate(row.businessDate),
    },
    {
      key: 'context',
      header: t.context,
      minWidth: '11rem',
      cell: (row) => (
        <div className="space-y-1">
          <p className="font-medium">{row.zone ?? '—'}</p>
          <p className="text-sm text-muted-foreground">{row.employee}</p>
        </div>
      ),
    },
    {
      key: 'remarks',
      header: t.remarks,
      minWidth: '11rem',
      cell: (row) => (
        <p className="line-clamp-3 max-w-64 whitespace-pre-line [overflow-wrap:anywhere]">
          {row.remarks.join('\n') || '—'}
        </p>
      ),
    },
    {
      key: 'updated',
      header: t.updated,
      minWidth: '8rem',
      cell: (row) => formatDateTime(row.updatedAt),
    },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <HowItWorks guide="photoLibrary" />
      <Toolbar>
        <DateField
          label={t.from}
          hint={t.dateHint}
          value={model.filters.from}
          maxDate={model.filters.to}
          onChange={(value) => model.change('from', value)}
          className="min-w-0 basis-36 flex-1 sm:w-44 sm:flex-none"
        />
        <DateField
          label={t.to}
          hint={t.dateHint}
          value={model.filters.to}
          minDate={model.filters.from}
          onChange={(value) => model.change('to', value)}
          error={model.valid ? undefined : t.invalidDates}
          className="min-w-0 basis-36 flex-1 sm:w-44 sm:flex-none"
        />
        <SelectField
          label={t.status}
          hint={t.statusHint}
          value={model.filters.status}
          onChange={(value) => model.change('status', value)}
          options={[
            { value: '', label: t.all },
            ...Object.entries(inspection.statuses).map(([value, label]) => ({ value, label })),
          ]}
          className="w-full sm:w-56"
        />
        <div className="min-w-0 w-full sm:w-72">
          <FormField label={t.search} hint={t.searchHint}>
            {(id) => (
              <TableSearch
                id={id}
                value={model.filters.search}
                maxLength={200}
                label={t.search}
                placeholder={t.searchPlaceholder}
                onChange={(value) => model.change('search', value)}
              />
            )}
          </FormField>
        </div>
        <IconButton
          icon={RotateCcwIcon}
          size="sm"
          label={t.reset}
          tooltip={t.resetHint}
          variant="outline"
          disabled={!model.canReset}
          onClick={model.reset}
        />
      </Toolbar>
      <QueryFeedback query={model.query} errorMessage={t.loadError} />
      {model.query.data && (
        <DataTable
          storageKey="photo-library"
          primaryKey="photo"
          columns={columns}
          rows={model.query.data.rows}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.photo.label}
          onRowClick={model.select}
          caption={t.title}
          empty={t.empty}
          emptyDescription={t.emptyHint}
          totalCount={model.query.data.total}
          pagination={model.pages}
          queryState={model.query}
          queryFeedback={false}
        />
      )}
      {model.selected && (
        <PhotoInspectionDialog
          key={model.selected.id}
          handoverId={model.selected.handoverId}
          photo={model.selected.photo}
          onClose={() => model.select(null)}
        />
      )}
    </div>
  );
}
