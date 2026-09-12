import { useState, type SetStateAction } from 'react';
import { useQuery } from '@tanstack/react-query';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { DataTable } from '@/components/app/data-table';
import { DetailText } from '@/components/app/row-detail';
import { Button } from '@/components/ui/button';
import { scheduleApi } from '../api/schedule-api';
import { scheduleKeys } from '../model/ownership';
import { historyDecision, historyTime } from '../model/history';
const t = messages(currentLocale()).scheduleWorkspace;
export function HistoryDecisions({
  id,
  accessKey,
  timezone,
  openVersion,
}: {
  id: string;
  accessKey: string;
  timezone: string;
  openVersion: (id: string) => void;
}) {
  const [requested, setRequested] = useState({ page: 1, pageSize: 20 });
  const query = useQuery({
    queryKey: scheduleKeys.history(accessKey, id, requested.page, requested.pageSize),
    queryFn: ({ signal }) => scheduleApi.history(id, requested, signal),
  });
  const total = query.data?.total ?? 0;
  const page = query.data?.page ?? requested.page;
  const size = query.data?.pageSize ?? requested.pageSize;
  const pagination = {
    page,
    size,
    pages: Math.max(1, Math.ceil(total / size)),
    from: total ? (page - 1) * size + 1 : 0,
    to: Math.min(total, page * size),
    setPage: (value: number) => setRequested((current) => ({ ...current, page: value })),
    setSize: (value: SetStateAction<number>) =>
      setRequested((current) => ({
        page: 1,
        pageSize: typeof value === 'function' ? value(current.pageSize) : value,
      })),
  };
  return (
    <section className="space-y-3" aria-label={t.historyDecisions}>
      <h3 className="font-semibold">{t.historyDecisions}</h3>
      {query.data && (
        <div className="flex flex-wrap gap-2">
          {(['supersedes', 'supersededBy'] as const).map((direction) => {
            const version = query.data.lineage[direction];
            return version ? (
              <Button
                key={direction}
                variant="outline"
                size="sm"
                onClick={() => openVersion(version.id)}
              >
                {direction === 'supersedes' ? t.historyPrevious : t.historyNext} · v
                {version.versionNo}
              </Button>
            ) : null;
          })}
        </div>
      )}
      <DataTable
        columns={[
          {
            key: 'decision',
            header: t.historyDecisions,
            cell: (entry) => {
              const view = historyDecision(entry);
              return (
                <div className="space-y-1 font-normal whitespace-normal [overflow-wrap:anywhere]">
                  <p className="font-medium">{view.action}</p>
                  <p className="text-muted-foreground">{view.actor}</p>
                  {view.detail && <p>{view.detail}</p>}
                  {entry.reason !== null && (
                    <DetailText label={t.historyReason} text={entry.reason} />
                  )}
                </div>
              );
            },
          },
          { key: 'at', header: t.historyTime, cell: (entry) => historyTime(entry.at, timezone) },
        ]}
        rows={query.data?.entries ?? []}
        rowKey={(entry) => entry.id}
        empty={t.historyUnavailable}
        queryState={query}
        pagination={pagination}
        totalCount={query.data?.total}
      />
    </section>
  );
}
