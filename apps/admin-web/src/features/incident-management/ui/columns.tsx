import { TextPreview } from '@/components/app/row-detail';
import type { IncidentView } from '@vakhta/contracts';
import { type IncidentSeverity, type IncidentStatus } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { type Column } from '@/components/app/data-table';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, StatusPill, type Tone } from '@/components/app/page';
import { formatDateTime as formatTime } from '@/lib/format';
import { currentLocale } from '@/i18n';
import { IncidentSlaCell } from './incident-sla';
import {
  BanIcon,
  CheckIcon,
  CircleCheckIcon,
  LockIcon,
  PlayIcon,
  RotateCcwIcon,
  CopyIcon,
  type LucideIcon,
} from 'lucide-react';

const all = messages(currentLocale());
const i = all.admin.incidents;
const hints = all.ui.hints;

const TRANSITION_ICON: Record<IncidentStatus, LucideIcon> = {
  REPORTED: RotateCcwIcon,
  ACKNOWLEDGED: CheckIcon,
  IN_PROGRESS: PlayIcon,
  RESOLVED: CircleCheckIcon,
  CLOSED: LockIcon,
  DUPLICATE: CopyIcon,
  REJECTED: BanIcon,
};

const SEVERITY_TONE: Record<IncidentSeverity, Tone> = {
  NORMAL: 'neutral',
  CRITICAL: 'warning',
  SAFETY: 'danger',
};
const STATUS_TONE: Record<IncidentStatus, Tone> = {
  REPORTED: 'danger',
  ACKNOWLEDGED: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
  CLOSED: 'neutral',
  DUPLICATE: 'neutral',
  REJECTED: 'neutral',
};

export function incidentColumns(knowledge: boolean): Column<IncidentView>[] {
  const columns: Column<IncidentView>[] = [
    {
      key: 'opened',
      header: i.opened,
      cell: (row) => <span className="tabular-nums">{formatTime(row.openedAt)}</span>,
    },
    {
      key: 'severity',
      header: i.severity,
      cell: (row) => (
        <StatusPill tone={SEVERITY_TONE[row.severity]}>
          {all.incidents.severities[row.severity]}
        </StatusPill>
      ),
    },
    {
      key: 'reason',
      header: i.problemType,
      cell: (row) => (
        <div>
          <div>{row.reasonLabel}</div>
          {row.rootCause && (
            <Muted>
              <TextPreview text={row.rootCause} />
            </Muted>
          )}
        </div>
      ),
    },
    {
      key: 'reportedBy',
      header: i.reportedBy,
      cell: (row) => row.reportedBy ?? '—',
      sortValue: (row) => row.reportedBy ?? '',
    },
    { key: 'zone', header: i.zone, cell: (row) => row.zoneName ?? '—' },
    { key: 'reports', header: i.reports, align: 'right', cell: (row) => row.reportsCount },
    { key: 'stopped', header: i.stoppedNow, align: 'right', cell: (row) => row.stoppedNow },
    {
      key: 'status',
      header: i.status,
      cell: (row) => (
        <StatusPill tone={STATUS_TONE[row.status]}>{all.incidents.statuses[row.status]}</StatusPill>
      ),
    },
    {
      key: 'sla',
      header: (
        <span className="inline-flex items-center gap-1">
          {i.sla}
          <InfoTip text={hints.incidentsSla} />
        </span>
      ),
      cell: (row) => <IncidentSlaCell incident={row} />,
    },
  ];

  return knowledge
    ? [
        ...columns.filter((column) => !['sla', 'stopped'].includes(column.key)),
        {
          key: 'resolution',
          header: i.resolution,
          cell: (row) => <TextPreview text={row.resolution || i.missingSolution} />,
        },
      ]
    : columns;
}
export { TRANSITION_ICON };
