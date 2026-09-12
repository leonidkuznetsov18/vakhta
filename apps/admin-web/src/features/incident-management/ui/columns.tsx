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

export function incidentColumns(): Column<IncidentView>[] {
  const columns: Column<IncidentView>[] = [
    {
      key: 'opened',
      sortValue: (row) => row.openedAt,
      header: i.opened,
      cell: (row) => (
        <span className="whitespace-nowrap tabular-nums">{formatTime(row.openedAt)}</span>
      ),
    },
    {
      key: 'reason',
      minWidth: '12rem',
      sortValue: (row) => row.reasonLabel,
      header: i.problemType,
      cell: (row) => (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 [overflow-wrap:anywhere]">{row.reasonLabel}</span>
            <StatusPill tone={SEVERITY_TONE[row.severity]}>
              {all.incidents.severities[row.severity]}
            </StatusPill>
          </div>
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
      cell: (row) => (
        <span className="block max-w-40 whitespace-normal [overflow-wrap:anywhere]">
          {row.reportedBy ?? '—'}
        </span>
      ),
      sortValue: (row) => row.reportedBy ?? '',
    },
    {
      key: 'zone',
      minWidth: '9rem',
      sortValue: (row) => row.zoneName ?? '',
      header: i.zone,
      cell: (row) => (
        <span className="block max-w-40 whitespace-normal [overflow-wrap:anywhere]">
          {row.zoneName ?? '—'}
        </span>
      ),
    },
    {
      key: 'impact',
      header: i.impact,
      minWidth: '8rem',
      sortValue: (row) => row.stoppedNow,
      cell: (row) => (
        <dl className="grid grid-cols-[1fr_auto] gap-x-2 text-xs tabular-nums">
          <dt>{i.stoppedNow}</dt>
          <dd className="font-semibold">{row.stoppedNow}</dd>
          <dt className="text-muted-foreground">{i.reports}</dt>
          <dd>{row.reportsCount}</dd>
        </dl>
      ),
    },
    {
      key: 'status',
      sortValue: (row) => all.incidents.statuses[row.status],
      header: i.status,
      cell: (row) => (
        <StatusPill tone={STATUS_TONE[row.status]}>{all.incidents.statuses[row.status]}</StatusPill>
      ),
    },
    {
      key: 'sla',
      label: i.sla,
      header: (
        <span className="inline-flex items-center gap-1">
          {i.sla}
          <InfoTip text={hints.incidentsSla} />
        </span>
      ),
      cell: (row) => <IncidentSlaCell incident={row} />,
    },
  ];

  return columns;
}
export { TRANSITION_ICON };
