import type { UseQueryResult } from '@tanstack/react-query';
import type { IncidentStatsView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { QueryFeedback } from '@/components/app/query-feedback';
import { EmptyState } from '@/components/app/page';
import { InfoTip } from '@/components/app/info-tip';
import { StateFilter } from '@/shared/ui/state-filter';
import { usePersistentState } from '@/lib/ui-store';
import { formatDuration } from '@/lib/format';
import { currentLocale } from '@/i18n';
import { StatsTable } from './stats-table';

const all = messages(currentLocale());
const i = all.admin.incidents;

/** Two breakdowns of the same period share one set of totals and one full-width table. */
export function IncidentStatistics({
  query,
  resetKey,
}: {
  query: UseQueryResult<IncidentStatsView, Error>;
  resetKey: string;
}) {
  const [grouping, setGrouping] = usePersistentState<'reason' | 'zone'>(
    'incident-stats.grouping',
    'reason',
  );
  const stats = query.data;
  const title = grouping === 'zone' ? i.byZone : i.byReason;
  const metrics = stats
    ? [
        { label: i.colIncidents, value: stats.totals.incidents },
        { label: i.colReports, value: stats.totals.reports },
        { label: i.downtimeLabel, value: formatDuration(stats.totals.downtimeMinutes) },
        {
          label: i.resolutionLabel,
          value:
            stats.totals.avgResolutionMinutes === null
              ? '—'
              : formatDuration(stats.totals.avgResolutionMinutes),
        },
        { label: i.colBreached, value: stats.totals.slaBreached },
      ]
    : [];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        {i.statisticsScope}
        <InfoTip text={all.ui.hints.incidentsStats} />
      </p>
      <QueryFeedback query={query} />
      {stats && (
        <>
          <section aria-label={i.periodTotals} className="rounded-lg border bg-muted/30 p-4">
            <h2 className="mb-3 text-sm font-semibold">{i.periodTotals}</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
              {metrics.map((metric) => (
                <div key={metric.label} className="min-w-0">
                  <dt className="text-sm text-muted-foreground">{metric.label}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">{metric.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          {stats.byReason.length === 0 && stats.byZone.length === 0 ? (
            <EmptyState text={all.ui.common.noResults} />
          ) : (
            <>
              <StateFilter
                label={i.groupBy}
                value={grouping}
                onChange={(value) => {
                  if (value === 'reason' || value === 'zone') setGrouping(value);
                }}
                options={[
                  { value: 'reason', label: i.byReason },
                  { value: 'zone', label: i.byZone },
                ]}
              />
              <StatsTable
                key={grouping}
                resetKey={resetKey}
                storageKey={`incident-stats.${grouping === 'zone' ? 'zones' : 'reasons'}`}
                title={title}
                rows={grouping === 'zone' ? stats.byZone : stats.byReason}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
