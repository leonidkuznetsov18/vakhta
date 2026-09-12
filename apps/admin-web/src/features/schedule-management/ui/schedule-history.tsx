import { useState, useId } from 'react';
import { XIcon } from 'lucide-react';
import { IconButton } from '@/shared/ui/icon-button';
import { useQuery, useQueries } from '@tanstack/react-query';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { DataTable } from '@/components/app/data-table';
import { QueryFeedback } from '@/components/app/query-feedback';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { scheduleKeys } from '../model/ownership';
import { formatDate } from '@/lib/format';
import { scheduleApi } from '../api/schedule-api';
import { historyTime, historyAssignmentStatus, historyAssignmentKind } from '../model/history';
import type { Workspace } from '../model/use-workspace';
import { employeeLabel } from './assignment-changes';
import { templateLabel } from '../lib/template-label';
import { HistoryDecisions } from './history-decisions';
const t = messages(currentLocale()).scheduleWorkspace;
const s = messages(currentLocale()).admin.schedule;
function HistoryDetail({
  id,
  workspace: w,
  openVersion,
}: {
  id: string;
  workspace: Workspace;
  openVersion: (id: string) => void;
}) {
  const query = useQuery({
    queryKey: scheduleKeys.detail(w.accessKey, id),
    queryFn: ({ signal }) => scheduleApi.detail(id, signal),
  });
  const missing = [...new Set(query.data?.assignments.map((item) => item.employeeId) ?? [])].filter(
    (employeeId) => !w.employees.some((employee) => employee.id === employeeId),
  );
  const names = useQueries({
    queries: missing.map((employeeId) => ({
      queryKey: scheduleKeys.employee(w.accessKey, employeeId),
      queryFn: ({ signal }: { signal: AbortSignal }) => scheduleApi.employee(employeeId, signal),
      enabled: w.canReadEmployees,
    })),
  });
  const labels = {
    ...w,
    employees: [...w.employees, ...names.flatMap((result) => (result.data ? [result.data] : []))],
  };
  return (
    <div className="space-y-6">
      <HistoryDecisions
        key={id}
        id={id}
        accessKey={w.accessKey}
        timezone={w.timezone}
        openVersion={openVersion}
      />
      <section className="space-y-3" aria-label={t.assigned}>
        <h3 className="font-semibold">
          {t.assigned}{' '}
          {query.data && <Badge variant="outline">{s.statuses[query.data.version.status]}</Badge>}
        </h3>
        {names
          .filter((result) => result.isError || result.isPaused)
          .slice(0, 1)
          .map((result) => (
            <QueryFeedback key="names" query={result} errorMessage={t.namesUnavailable} />
          ))}
        <DataTable
          columns={[
            {
              key: 'worker',
              header: t.workers,
              cell: (item) => (
                <div className="space-y-1 whitespace-normal [overflow-wrap:anywhere]">
                  <p className="font-medium">{employeeLabel(labels, item.employeeId)}</p>
                  <p>{historyAssignmentStatus(item.status)}</p>
                  <p className="text-muted-foreground">
                    {item.acknowledgedAt
                      ? `${t.acknowledged} · ${historyTime(item.acknowledgedAt, w.timezone)}`
                      : t.notAcknowledged}
                  </p>
                </div>
              ),
            },
            {
              key: 'assignment',
              header: t.assigned,
              cell: (item) => (
                <div className="space-y-1 whitespace-normal [overflow-wrap:anywhere]">
                  <p className="font-medium">
                    {item.businessDate} · {templateLabel(item.templateCode, t)}
                  </p>
                  <p>
                    {historyTime(item.planStartAt, w.timezone)} –{' '}
                    {historyTime(item.planEndAt, w.timezone)}
                  </p>
                  <p>
                    {item.zoneId
                      ? (w.zones.find((zone) => zone.id === item.zoneId)?.name ?? item.zoneId)
                      : t.noZone}
                  </p>
                  <p>{historyAssignmentKind(item.kind)}</p>
                  {item.teamId && (
                    <p>
                      {t.historyTeam}:{' '}
                      {w.org?.teams.find((team) => team.id === item.teamId)?.name ?? item.teamId}
                    </p>
                  )}
                  {item.positionId && (
                    <p>
                      {t.historyPosition}:{' '}
                      {w.org?.positions.find((position) => position.id === item.positionId)?.name ??
                        item.positionId}
                    </p>
                  )}
                </div>
              ),
            },
          ]}
          rows={query.data?.assignments ?? []}
          rowKey={(item) => item.id}
          empty={t.noAssignments}
          pageSize={10}
          queryState={query}
        />
      </section>
    </div>
  );
}
export function ScheduleHistory({ workspace: w }: { workspace: Workspace }) {
  const [opened, setOpened] = useState<string | null>(null);
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  const historyId = useId();
  const version = w.versions.find((item) => item.id === opened);
  return (
    <div id={historyId} tabIndex={-1} className="space-y-3">
      <p className="text-sm text-muted-foreground">{t.historyHint}</p>
      <DataTable
        columns={[
          { key: 'version', header: t.version, cell: (item) => `v${item.versionNo}` },
          { key: 'status', header: t.status, cell: (item) => s.statuses[item.status] },
          {
            key: 'date',
            header: t.date,
            cell: (item) => formatDate(item.publishedAt ?? item.createdAt),
          },
        ]}
        rows={w.versions}
        rowKey={(item) => item.id}
        empty={t.empty}
        storageKey="schedule.history"
        onRowClick={(item) => {
          setOrigin(document.activeElement instanceof HTMLElement ? document.activeElement : null);
          setOpened(item.id);
        }}
      />
      <Sheet
        open={opened !== null}
        onOpenChange={(open) => {
          if (!open) setOpened(null);
        }}
      >
        <SheetContent
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (origin?.isConnected ? origin : document.getElementById(historyId))?.focus();
          }}
          className="data-[side=right]:w-full data-[side=right]:sm:max-w-3xl gap-0"
        >
          <IconButton
            icon={XIcon}
            label={messages(currentLocale()).ui.common.close}
            tooltip={messages(currentLocale()).ui.common.close}
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4"
            onClick={() => setOpened(null)}
          />
          <SheetHeader className="border-b p-6 pr-14">
            <SheetTitle>
              {t.history} {version && `· v${version.versionNo}`}
            </SheetTitle>
            <SheetDescription>
              {format(t.historyHintDetail, { timezone: w.timezone })}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {opened && (
              <HistoryDetail
                key={`${w.accessKey}:${opened}`}
                id={opened}
                workspace={w}
                openVersion={setOpened}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
