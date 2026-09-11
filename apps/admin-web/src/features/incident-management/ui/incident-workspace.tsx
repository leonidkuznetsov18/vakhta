import { QueryFeedback } from '@/components/app/query-feedback';
import { messages } from '@vakhta/i18n';
import { StateFilter } from '@/shared/ui/state-filter';
import { DataTable } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { CalendarPeriodField } from '@/shared/ui/calendar-period-field';
import { SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Lightbox } from '@/components/app/photo';
import { EmptyState, LiveBadge, ROW_DANGER, Section, Toolbar } from '@/components/app/page';
import { currentLocale } from '@/i18n';
import { HowItWorks } from '@/components/app/how-it-works';
import { useIncidentWorkspace } from '../model/workspace';
import { incidentNeedsReaction } from '../model/sla';
import { IncidentDetail } from './incident-detail';
import { StatsTable } from './stats-table';
import { incidentColumns } from './columns';

const all = messages(currentLocale());
const i = all.admin.incidents;
const hints = all.ui.hints;

export function IncidentWorkspace() {
  const model = useIncidentWorkspace();
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
      <HowItWorks guide="incidents" />
      <QueryFeedback query={model.orgQuery} />
      <Toolbar>
        <SelectField
          label={i.site}
          value={siteId}
          onChange={setSiteId}
          placeholder="—"
          options={org?.sites.map((s) => ({ value: s.id, label: s.name })) ?? []}
          className="w-56"
        />
        <CalendarPeriodField
          label={i.period}
          from={date}
          to={model.endDate}
          mode={periodMode}
          labels={{ day: i.day, month: i.month, year: i.year, all: i.allDates }}
          open={model.calendarOpen}
          onOpenChange={model.setCalendarOpen}
          onApply={model.applyPeriod}
          onClear={model.clearPeriod}
        />
        <div className="flex items-center gap-1">
          <StateFilter
            value={scope}
            onChange={model.setScope}
            label={all.admin.sections.incidents}
            options={[
              { value: 'open', label: i.scopeOpen },
              { value: 'all', label: i.scopeAll },
            ]}
          />
          <InfoTip text={hints.incidentsScope} />
        </div>
        <div className="ml-auto">
          <LiveBadge live={live} />
        </div>
      </Toolbar>
      <Feedback error={error} />

      <DataTable
        queryState={model.listQuery}
        columns={incidentColumns()}
        rows={rows}
        storageKey="incidents"
        resetKey={`${siteId}:${scope}:${date}:${model.endDate}:${periodMode}`}
        caption={all.admin.sections.incidents}
        primaryKey="reason"
        rowLabel={(row) => `${row.reasonLabel} · ${row.reportedBy ?? row.zoneName ?? row.openedAt}`}
        searchText={model.searchText}
        searchPlaceholder={i.search}
        loading={model.loading}
        onRowClick={model.toggleRow}
        rowActions={model.rowActions}
        rowKey={(row) => row.id}
        empty={i.empty}
        rowClassName={(row) => (incidentNeedsReaction(row) ? ROW_DANGER : undefined)}
        activeKey={openId}
        expanded={(row) => (row.id === openId ? <IncidentDetail row={row} model={model} /> : null)}
      />
      <Lightbox images={lightbox} onClose={model.closeLightbox} title={i.photo} />

      <Section title={i.stats} hint={hints.incidentsStats}>
        <QueryFeedback query={model.statsQuery} />
        {/* Two cuts of one period: when the period holds nothing, both tables said so, and the
            section repeated itself. One sentence answers for the period. */}
        {stats &&
          (stats.byReason.length === 0 && stats.byZone.length === 0 ? (
            <EmptyState text={all.ui.common.noResults} />
          ) : (
            <div className="grid gap-4 2xl:grid-cols-2">
              <StatsTable
                resetKey={`${siteId}:${scope}:${date}:${model.endDate}:${periodMode}`}
                storageKey="incident-stats.reasons"
                title={i.byReason}
                rows={stats.byReason}
                totals={stats.totals}
              />
              <StatsTable
                resetKey={`${siteId}:${scope}:${date}:${model.endDate}:${periodMode}`}
                storageKey="incident-stats.zones"
                title={i.byZone}
                rows={stats.byZone}
                totals={stats.totals}
              />
            </div>
          ))}
      </Section>
    </div>
  );
}
