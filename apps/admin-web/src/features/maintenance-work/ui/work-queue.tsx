import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SirenIcon, WrenchIcon } from 'lucide-react';
import { WorkViewCode, type WorkRow, type WorkView } from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import {
  OverduePill,
  ReadinessPill,
  WorkStatusPill,
  formatDayMonth,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { DataTable, type Column } from '@/components/app/data-table';
import { ROW_DANGER, Section, StatusPill } from '@/components/app/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useNow } from '@/lib/clock';
import { formatDuration, formatTime } from '@/lib/format';
import { StateFilter } from '@/shared/ui/state-filter';
import {
  RowStatusKind,
  activeRepairs,
  isRepair,
  minutesUntil,
  rowStatus,
} from '../model/work-view';

const VIEWS: readonly WorkView[] = [
  WorkViewCode.URGENT,
  WorkViewCode.TODAY,
  WorkViewCode.REVIEW,
  WorkViewCode.ALL,
];

function StatusCell({ row }: { readonly row: WorkRow }) {
  const t = maintenanceMessages();
  const status = rowStatus(row, useNow());
  if (status.kind === RowStatusKind.NOT_ACCEPTED)
    return (
      <StatusPill tone="danger">
        {status.minutesLeft > 0
          ? format(t.work.notAccepted, { left: formatDuration(status.minutesLeft) })
          : t.work.escalated}
      </StatusPill>
    );
  if (status.kind === RowStatusKind.OVERDUE) return <OverduePill />;
  return <WorkStatusPill status={status.status} />;
}

function dueText(row: WorkRow): string {
  const t = maintenanceMessages();
  if (isRepair(row) && !row.acceptedAt && row.ackDueAt)
    return format(t.work.acceptBy, { time: formatTime(row.ackDueAt) });
  return formatDayMonth(row.plannedOn ?? row.dueOn);
}

const COLUMNS: readonly Column<WorkRow>[] = [
  {
    key: 'number',
    header: maintenanceMessages().work.columns.number,
    sortValue: (row) => row.number,
    cell: (row) => <span className="tabular-nums">{row.number}</span>,
  },
  {
    key: 'work',
    header: maintenanceMessages().work.columns.work,
    minWidth: '14rem',
    sortValue: (row) => row.title,
    cell: (row) => (
      <span className="flex items-center gap-2">
        {isRepair(row) ? (
          <SirenIcon
            className="size-4 shrink-0 text-red-600"
            aria-label={maintenanceMessages().workType.EMERGENCY_REPAIR}
          />
        ) : (
          <WrenchIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-label={maintenanceMessages().workType.PLANNED_MAINTENANCE}
          />
        )}
        <span className="break-words">{row.title}</span>
      </span>
    ),
  },
  {
    key: 'machine',
    header: maintenanceMessages().work.columns.machine,
    sortValue: (row) => row.equipment.code,
    cell: (row) => (
      <span className="flex flex-col leading-tight">
        <span className="font-medium">{row.equipment.code}</span>
        <span className="line-clamp-2 text-xs text-muted-foreground">{row.equipment.name}</span>
      </span>
    ),
  },
  {
    key: 'mechanic',
    header: maintenanceMessages().work.columns.mechanic,
    sortValue: (row) => row.assignee.fullName,
    cell: (row) => row.assignee.fullName,
  },
  {
    key: 'due',
    header: maintenanceMessages().work.columns.due,
    sortValue: (row) => row.plannedOn ?? row.ackDueAt ?? '',
    cell: (row) => <span className="tabular-nums">{dueText(row)}</span>,
  },
  {
    key: 'status',
    header: maintenanceMessages().work.columns.status,
    sortValue: (row) => row.status,
    cell: (row) => <StatusCell row={row} />,
  },
  {
    key: 'materials',
    header: maintenanceMessages().work.columns.materials,
    cell: (row) => (isRepair(row) ? '—' : <ReadinessPill readiness={row.readiness} />),
  },
];

function notAcceptedText(row: WorkRow, now: Date): string {
  const t = maintenanceMessages().work;
  const minutes = row.ackDueAt ? minutesUntil(row.ackDueAt, now) : 0;
  if (minutes <= 0) return format(t.emergencyBannerEscalated, { mechanic: row.assignee.fullName });
  return format(t.emergencyBannerNotAccepted, {
    mechanic: row.assignee.fullName,
    left: formatDuration(minutes),
  });
}

function RepairBanner({ row, onOpen }: { readonly row: WorkRow; readonly onOpen: () => void }) {
  const t = maintenanceMessages().work;
  const now = useNow();
  return (
    <Alert variant="destructive">
      <SirenIcon />
      <AlertTitle>
        {format(t.emergencyBanner, {
          code: row.equipment.code,
          name: row.equipment.name,
          number: row.number,
        })}
      </AlertTitle>
      <AlertDescription>
        {row.acceptedAt
          ? format(t.emergencyBannerAccepted, { mechanic: row.assignee.fullName })
          : notAcceptedText(row, now)}
        <Button size="sm" variant="outline" className="mt-2 w-fit" onClick={onOpen}>
          {t.openRepair}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** The work queue (spec 014, US6, US7): open repairs on top, then the filtered table. */
export function WorkQueue({
  activeId,
  onOpen,
}: {
  readonly activeId: string | null;
  readonly onOpen: (id: string) => void;
}) {
  const t = maintenanceMessages().work;
  const [view, setView] = useState<WorkView>(WorkViewCode.ALL);
  const query = useQuery(maintenanceQueries.workList({ view }));
  const urgent = useQuery(maintenanceQueries.workList({ view: WorkViewCode.URGENT }));
  return (
    <div className="flex flex-col gap-4">
      {activeRepairs(urgent.data ?? []).map((row) => (
        <RepairBanner key={row.id} row={row} onOpen={() => onOpen(row.id)} />
      ))}
      <Section title={t.title}>
        <StateFilter
          label={t.title}
          value={view}
          onChange={setView}
          options={VIEWS.map((value) => ({ value, label: t.views[value] }))}
        />
        <DataTable
          columns={COLUMNS}
          rows={query.data ?? []}
          rowKey={(row) => row.id}
          empty={t.empty}
          queryState={query}
          loading={query.isPending}
          storageKey="maintenance.work"
          searchText={(row) =>
            `${row.number} ${row.title} ${row.equipment.code} ${row.equipment.name} ${row.assignee.fullName}`
          }
          onRowClick={(row) => onOpen(row.id)}
          activeKey={activeId}
          rowClassName={(row) => (isRepair(row) ? ROW_DANGER : undefined)}
          rowLabel={(row) => `${row.number} ${row.title}`}
          resetKey={view}
        />
      </Section>
    </div>
  );
}
