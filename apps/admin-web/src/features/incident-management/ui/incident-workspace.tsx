import { messages } from '@vakhta/i18n';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { DateField, MonthField } from '@/components/app/date-picker';
import { SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Lightbox } from '@/components/app/photo';
import { EmptyState, LiveBadge, ROW_DANGER, Section, Toolbar } from '@/components/app/page';
import { currentLocale } from '@/i18n';
import { HowItWorks } from '@/components/app/how-it-works';
import { useIncidentWorkspace } from '../model/workspace';
import { IncidentDetail } from './incident-detail';
import { StatsTable } from './stats-table';
import { incidentColumns } from './columns';

const all = messages(currentLocale());
const i = all.admin.incidents;
const hints = all.ui.hints;

export function IncidentWorkspace({ knowledge = false }: { knowledge?: boolean }) {
  const model = useIncidentWorkspace(knowledge);
  const {
    org,
    siteId,
    setSiteId,
    scope,
    periodMode,
    date,
    live,
    error,
    rows,
    openId,
    lightbox,
    stats,
  } = model;

  return (
    <div className="flex flex-col gap-4">
      {knowledge ? (
        <p className="text-sm text-muted-foreground">{i.knowledgeHint}</p>
      ) : (
        <HowItWorks guide="incidents" />
      )}
      <Toolbar>
        <SelectField
          label={i.site}
          value={siteId}
          onChange={setSiteId}
          placeholder="—"
          options={org?.sites.map((s) => ({ value: s.id, label: s.name })) ?? []}
          className="w-56"
        />
        {!knowledge && (
          <div className="flex items-center gap-1">
            <Tabs value={scope} onValueChange={model.setScope}>
              <TabsList>
                <TabsTrigger value="open">{i.scopeOpen}</TabsTrigger>
                <TabsTrigger value="all">{i.scopeAll}</TabsTrigger>
              </TabsList>
            </Tabs>
            <InfoTip text={hints.incidentsScope} />
          </div>
        )}
        <SelectField
          label={i.period}
          value={periodMode}
          onChange={model.setPeriodMode}
          searchable={false}
          options={model.periodOptions}
        />
        {periodMode === 'day' && <DateField label={i.date} value={date} onChange={model.setDate} />}
        {periodMode === 'month' && (
          <MonthField label={i.month} value={date.slice(0, 7)} onChange={model.setMonth} />
        )}
        {periodMode === 'year' && (
          <SelectField
            label={i.year}
            value={date.slice(0, 4)}
            onChange={model.setYear}
            options={model.yearOptions}
          />
        )}
        <div className="ml-auto">
          <LiveBadge live={live} />
        </div>
      </Toolbar>
      <Feedback error={error} />

      <DataTable
        columns={incidentColumns(knowledge)}
        rows={rows}
        storageKey={knowledge ? 'incidentKnowledge' : 'incidents'}
        searchText={model.searchText}
        searchPlaceholder={i.search}
        loading={model.loading}
        onRowClick={model.toggleRow}
        rowActions={knowledge ? undefined : model.rowActions}
        rowKey={(row) => row.id}
        empty={i.empty}
        rowClassName={(row) => (row.slaBreached ? ROW_DANGER : undefined)}
        activeKey={openId}
        expanded={(row) => (row.id === openId ? <IncidentDetail row={row} model={model} /> : null)}
      />
      <Lightbox images={lightbox} onClose={model.closeLightbox} title={i.photo} />

      {!knowledge && (
        <Section title={i.stats} hint={hints.incidentsStats}>
          {/* Two cuts of one period: when the period holds nothing, both tables said so, and the
            section repeated itself. One sentence answers for the period. */}
          {stats &&
            (stats.byReason.length === 0 && stats.byZone.length === 0 ? (
              <EmptyState text={all.ui.common.noResults} />
            ) : (
              <div className="grid gap-4 2xl:grid-cols-2">
                <StatsTable title={i.byReason} rows={stats.byReason} totals={stats.totals} />
                <StatsTable title={i.byZone} rows={stats.byZone} totals={stats.totals} />
              </div>
            ))}
        </Section>
      )}
    </div>
  );
}
