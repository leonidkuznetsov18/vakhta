import { QueryFeedback } from '@/components/app/query-feedback';
import { messages } from '@vakhta/i18n';
import { StateFilter } from '@/shared/ui/state-filter';
import { DataTable } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { DateField } from '@/components/app/date-picker';
import { IconButton } from '@/shared/ui/icon-button';
import { XIcon } from 'lucide-react';
import { SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Lightbox } from '@/components/app/photo';
import { LiveBadge, ROW_DANGER, Toolbar } from '@/components/app/page';
import { currentLocale } from '@/i18n';
import { HowItWorks } from '@/components/app/how-it-works';
import { useIncidentWorkspace } from '../model/workspace';
import { incidentNeedsReaction } from '../model/sla';
import { IncidentDetail } from './incident-detail';
import { IncidentStatistics } from './incident-statistics';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { incidentColumns } from './columns';

const all = messages(currentLocale());
const i = all.admin.incidents;
const hints = all.ui.hints;

export function IncidentWorkspace() {
  const model = useIncidentWorkspace();
  const { org, siteId, setSiteId, scope, periodMode, date, live, error, rows, openId, lightbox } =
    model;

  return (
    <Tabs value={model.view} onValueChange={model.setView} className="min-w-0 gap-4">
      <TabsList aria-label={all.admin.sections.incidents}>
        <TabsTrigger value="queue">{i.queueTab}</TabsTrigger>
        <TabsTrigger value="statistics">{i.stats}</TabsTrigger>
      </TabsList>
      {model.view === 'queue' && <HowItWorks guide="incidents" />}
      <QueryFeedback query={model.orgQuery} />
      <Toolbar>
        <SelectField
          label={i.site}
          value={siteId}
          onChange={setSiteId}
          placeholder="—"
          options={org?.sites.map((s) => ({ value: s.id, label: s.name })) ?? []}
          className="w-full sm:w-56"
        />
        <DateField
          label={i.from}
          hint={i.dateRangeHint}
          value={model.dates.from}
          maxDate={model.dates.to}
          onChange={(value) => model.changeDate('from', value)}
          className="min-w-0 flex-1 basis-36 sm:w-56 sm:flex-none"
        />
        <DateField
          label={i.to}
          hint={i.dateRangeHint}
          value={model.dates.to}
          minDate={model.dates.from}
          onChange={(value) => model.changeDate('to', value)}
          className="min-w-0 flex-1 basis-36 sm:w-56 sm:flex-none"
        />
        {(model.dates.from || model.dates.to) && (
          <IconButton
            icon={XIcon}
            label={i.clearDates}
            tooltip={i.clearDates}
            size="icon"
            aria-label={i.clearDates}
            variant="ghost"
            onClick={model.clearPeriod}
          >
            <span className="sr-only">{i.clearDates}</span>
          </IconButton>
        )}
        {model.view === 'queue' && (
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
        )}
        <div className="ml-auto">
          <LiveBadge live={live} />
        </div>
      </Toolbar>
      <Feedback error={error} />

      <TabsContent value="queue" className="min-w-0">
        <DataTable
          queryState={model.listQuery}
          columns={incidentColumns()}
          rows={rows}
          storageKey="incidents"
          resetKey={`${siteId}:${scope}:${date}:${model.endDate}:${periodMode}`}
          caption={all.admin.sections.incidents}
          primaryKey="reason"
          rowLabel={(row) =>
            `${row.reasonLabel} · ${row.reportedBy ?? row.zoneName ?? row.openedAt}`
          }
          searchText={model.searchText}
          searchPlaceholder={i.search}
          loading={model.loading}
          onRowClick={model.toggleRow}
          rowActions={model.rowActions}
          rowKey={(row) => row.id}
          empty={i.empty}
          rowClassName={(row) => (incidentNeedsReaction(row) ? ROW_DANGER : undefined)}
          activeKey={openId}
          expanded={(row) =>
            row.id === openId ? <IncidentDetail row={row} model={model} /> : null
          }
        />
      </TabsContent>
      <Lightbox images={lightbox} onClose={model.closeLightbox} title={i.photo} />

      <TabsContent value="statistics" className="min-w-0">
        <IncidentStatistics
          query={model.statsQuery}
          resetKey={`${siteId}:${date}:${model.endDate}:${periodMode}`}
        />
      </TabsContent>
    </Tabs>
  );
}
