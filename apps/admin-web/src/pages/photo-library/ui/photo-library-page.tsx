import { SearchIcon, XIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { PhotoInspectionDialog, InspectionPhoto } from '@/features/photo-inspection';
import { DataTable, type Column } from '@/components/app/data-table';
import { HowItWorks } from '@/components/app/how-it-works';
import { Section } from '@/components/app/page';
import { FormField, SelectField } from '@/components/app/fields';
import { DateField } from '@/components/app/date-picker';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Input } from '@/components/ui/input';
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
      cell: (row) => (
        <div className="w-36 max-w-full">
          <InspectionPhoto
            photo={row.photo}
            loadLink={() => libraryApi.link(row)}
            onOpen={() => model.select(row)}
          />
        </div>
      ),
    },
    {
      key: 'status',
      header: t.status,
      cell: (row) => (
        <div className="space-y-2">
          <Badge variant={row.status === 'PROBLEMS' ? 'destructive' : 'secondary'}>
            {inspection.statuses[row.status]}
          </Badge>
          {row.archived && <p className="text-xs text-muted-foreground">{t.archived}</p>}
        </div>
      ),
    },
    { key: 'date', header: t.date, cell: (row) => formatDate(row.businessDate) },
    { key: 'zone', header: t.zone, cell: (row) => row.zone ?? '—' },
    { key: 'employee', header: t.employee, cell: (row) => row.employee },
    { key: 'regions', header: t.regions, cell: (row) => row.annotationCount },
    {
      key: 'remarks',
      header: t.remarks,
      cell: (row) => (
        <p className="line-clamp-3 max-w-64 whitespace-pre-line [overflow-wrap:anywhere]">
          {row.remarks.join('\n') || '—'}
        </p>
      ),
    },
    { key: 'updated', header: t.updated, cell: (row) => formatDateTime(row.updatedAt) },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <HowItWorks guide="photoLibrary" />
      <Section title={t.title} description={t.description}>
        <form
          className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            model.apply();
          }}
        >
          <FormField label={t.search} hint={t.searchHint}>
            {(id) => (
              <Input
                id={id}
                value={model.filters.search}
                maxLength={200}
                onChange={(event) => model.change('search', event.target.value)}
              />
            )}
          </FormField>
          <SelectField
            label={t.status}
            hint={t.statusHint}
            value={model.filters.status}
            onChange={(value) => model.change('status', value)}
            options={[
              { value: '', label: t.all },
              ...Object.entries(inspection.statuses).map(([value, label]) => ({ value, label })),
            ]}
          />
          <DateField
            label={t.from}
            hint={t.dateHint}
            value={model.filters.from}
            maxDate={model.filters.to}
            onChange={(value) => model.change('from', value)}
          />
          <DateField
            label={t.to}
            hint={t.dateHint}
            value={model.filters.to}
            minDate={model.filters.from}
            onChange={(value) => model.change('to', value)}
            error={model.valid ? undefined : t.invalidDates}
          />
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
            <IconButton
              type="submit"
              icon={SearchIcon}
              label={t.searchAction}
              tooltip={t.searchHint}
              disabled={!model.valid}
            />
            <IconButton
              icon={XIcon}
              label={t.reset}
              tooltip={t.resetHint}
              variant="outline"
              onClick={model.reset}
            />
          </div>
        </form>
        <QueryFeedback query={model.query} />
        {model.query.data && (
          <DataTable
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
      </Section>
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
