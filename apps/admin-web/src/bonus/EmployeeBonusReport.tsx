import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  BonusHistoryEntry,
  EmployeeBonusShiftView,
  EmployeeBonusTrendMonth,
} from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { ExternalLinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/app/data-table';
import { Muted } from '@/components/app/page';
import { QueryFeedback, type QueryFeedbackState } from '@/components/app/query-feedback';
import { RowDetail, ScrollableText, TextPreview } from '@/components/app/row-detail';
import { EmployeeProfileLink } from '@/entities/employee';
import { HANDOVER_SHOWN_AS, HandoverStatusPill } from '@/entities/handover';
import { formatDate, formatDateTime } from '@/lib/format';
import { useOrg } from '@/lib/org';
import { setUiState } from '@/lib/ui-store';
import { useNavigation } from '@/navigation';
import { currentLocale } from '../i18n.tsx';
import {
  employeeReportQuery,
  hasRemarks,
  isIssueReview,
  isQuietTrend,
  remarkPreview,
  shiftTime,
  trendBars,
} from './employee-report-model.ts';
import { PointsRemarksChart } from './PointsRemarksChart.tsx';

const all = messages(currentLocale());
const b = all.admin.bonus;
const h = all.admin.handover;

/**
 * One employee's month under their row of the points table: the trend of the last twelve months,
 * every shift with its checklist and the remarks on it, and the month-end awards. Read-only.
 */
export function EmployeeBonusReport({
  employeeId,
  month,
  siteId,
}: {
  readonly employeeId: string;
  readonly month: string;
  readonly siteId: string;
}) {
  const { go } = useNavigation();
  const { orgOrEmpty } = useOrg();
  const report = useQuery(employeeReportQuery(employeeId, month));
  const data = report.data ?? null;
  // Categories and reason codes are stored as codes; the dictionary gives them their names.
  const reasonLabels = new Map(orgOrEmpty.reasonCodes.map((r) => [r.code, r.label]));

  const openHandover = (shift: EmployeeBonusShiftView) => {
    if (!shift.handoverId) return;
    // The handover page lists pending reports of every day by default; a closed report of this
    // shift is found only with its day and the "all" scope set first.
    setUiState({
      'handover.siteId': siteId,
      'handover.date': shift.businessDate,
      'handover.scope': 'all',
    });
    go('handover', shift.handoverId);
  };

  return (
    <RowDetail>
      <div className="flex min-w-0 flex-col gap-5" data-testid="bonus-employee-report">
        <QueryFeedback query={report} />
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <EmployeeProfileLink
                id={data.employee.employeeId}
                name={data.employee.employeeName}
              />
              <Muted>
                {data.employee.personnelNumber}
                {data.employee.orgUnitName ? ` · ${data.employee.orgUnitName}` : ''}
              </Muted>
            </div>
            <TrendChart trend={data.trend} />
            <ShiftsTable
              query={report}
              shifts={data.shifts}
              resetKey={`${employeeId}:${month}`}
              reasonLabels={reasonLabels}
              onOpenHandover={openHandover}
            />
            <AwardsList awards={data.awards} />
          </>
        )}
      </div>
    </RowDetail>
  );
}

function TrendChart({ trend }: { readonly trend: readonly EmployeeBonusTrendMonth[] }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold">{b.employeeTrend}</h3>
      {isQuietTrend(trend) ? (
        <Muted>{b.employeeTrendEmpty}</Muted>
      ) : (
        <PointsRemarksChart bars={trendBars(trend)} />
      )}
    </section>
  );
}

const SHIFT_COLUMNS: Column<EmployeeBonusShiftView>[] = [
  {
    key: 'date',
    header: b.shiftDate,
    cell: (s) => formatDate(s.businessDate),
    sortValue: (s) => s.businessDate,
  },
  {
    key: 'time',
    header: b.shiftTime,
    cell: (s) => <span className="tabular-nums">{shiftTime(s)}</span>,
    sortValue: (s) => s.startedAt ?? '',
  },
  {
    key: 'zone',
    header: b.zone,
    cell: (s) => s.zoneName ?? <Muted>{b.noZone}</Muted>,
    sortValue: (s) => s.zoneName ?? '',
  },
  {
    key: 'checklist',
    header: b.checklistStatus,
    cell: (s) =>
      s.handoverStatus ? (
        <HandoverStatusPill status={s.handoverStatus} />
      ) : (
        <Muted>{b.noChecklist}</Muted>
      ),
    sortValue: (s) => (s.handoverStatus ? HANDOVER_SHOWN_AS[s.handoverStatus] : ''),
  },
  {
    key: 'remarks',
    header: b.remarks,
    cell: (s) => {
      const preview = remarkPreview(s);
      return preview ? <TextPreview text={preview} /> : <Muted>—</Muted>;
    },
  },
  {
    key: 'points',
    header: b.points,
    align: 'right',
    cell: (s) => <span className="font-semibold tabular-nums">{s.points}</span>,
    sortValue: (s) => s.points,
  },
];

type ReasonLabels = ReadonlyMap<string, string>;

function ShiftsTable({
  query,
  shifts,
  resetKey,
  reasonLabels,
  onOpenHandover,
}: {
  readonly query: QueryFeedbackState;
  readonly shifts: readonly EmployeeBonusShiftView[];
  readonly resetKey: string;
  readonly reasonLabels: ReasonLabels;
  readonly onOpenHandover: (shift: EmployeeBonusShiftView) => void;
}) {
  const [openShift, setOpenShift] = useState<string | null>(null);
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold">{b.employeeShifts}</h3>
      <DataTable
        queryState={query}
        queryFeedback={false}
        columns={SHIFT_COLUMNS}
        rows={shifts}
        storageKey="bonus-employee-shifts"
        resetKey={resetKey}
        primaryKey="date"
        rowKey={(s) => s.shiftSessionId}
        rowLabel={(s) => `${formatDate(s.businessDate)} · ${s.zoneName ?? b.noZone}`}
        onRowClick={(s) => setOpenShift(openShift === s.shiftSessionId ? null : s.shiftSessionId)}
        activeKey={openShift}
        expanded={(s) =>
          s.shiftSessionId === openShift ? (
            <ShiftDetail
              shift={s}
              reasonLabels={reasonLabels}
              onOpenHandover={() => onOpenHandover(s)}
            />
          ) : null
        }
        empty={b.employeeShiftsEmpty}
      />
    </section>
  );
}

function AwardsList({ awards }: { readonly awards: readonly BonusHistoryEntry[] }) {
  if (awards.length === 0) return null;
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold">{b.monthAwards}</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {awards.map((award) => (
          <li key={award.id} className="flex items-center gap-3">
            <span>{b.historyKinds[award.kind] ?? award.kind}</span>
            <span className="ml-auto font-semibold tabular-nums">{award.points}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Everything behind one shift's line: the employee's own marks, the acceptance, the decision. */
function ShiftDetail({
  shift,
  reasonLabels,
  onOpenHandover,
}: {
  readonly shift: EmployeeBonusShiftView;
  readonly reasonLabels: ReasonLabels;
  readonly onOpenHandover: () => void;
}) {
  const reason = (code: string | null) => (code ? (reasonLabels.get(code) ?? code) : null);
  return (
    <RowDetail>
      <div className="flex min-w-0 flex-col gap-4">
        {shift.checklistName && (
          <Muted>
            {b.checklistStatus}: {shift.checklistName}
            {shift.submittedAt ? ` · ${formatDateTime(shift.submittedAt)}` : ''}
          </Muted>
        )}
        {!hasRemarks(shift) && <Muted>{shift.handoverId ? b.noRemarks : b.noChecklist}</Muted>}
        <OwnRemarks shift={shift} reason={reason} />
        <ReviewSection shift={shift} reason={reason} />
        <ResolutionSection shift={shift} reason={reason} />
        {shift.handoverId && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={onOpenHandover}>
              <ExternalLinkIcon aria-hidden="true" />
              {b.openHandover}
            </Button>
          </div>
        )}
      </div>
    </RowDetail>
  );
}

type ReasonOf = (code: string | null) => string | null;

function OwnRemarks({
  shift,
  reason,
}: {
  readonly shift: EmployeeBonusShiftView;
  readonly reason: ReasonOf;
}) {
  if (shift.remarks.length === 0) return null;
  return (
    <section className="min-w-0">
      <h4 className="mb-1 text-sm font-semibold">{b.ownRemarks}</h4>
      <ul className="flex flex-col gap-1 text-sm">
        {shift.remarks.map((remark) => (
          <li key={remark.itemKey} className="flex gap-2">
            <span aria-hidden="true">⚠️</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {remark.label}
              {remark.category ? <Muted>{` · ${reason(remark.category)}`}</Muted> : null}
              {remark.text ? <Muted>{` · ${remark.text}`}</Muted> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewSection({
  shift,
  reason,
}: {
  readonly shift: EmployeeBonusShiftView;
  readonly reason: ReasonOf;
}) {
  const review = shift.review;
  if (!review) return null;
  const shown = isIssueReview(review) ? 'REMARK' : 'APPROVED';
  const category = reason(review.category);
  return (
    <section className="min-w-0">
      <h4 className="mb-1 text-sm font-semibold">{b.reviewRemark}</h4>
      <Muted>
        {review.reviewerName} · {h.shown[shown]} · {formatDateTime(review.reviewedAt)}
        {category ? ` · ${category}` : ''}
      </Muted>
      {review.comment && <ScrollableText label={b.reviewRemark} text={review.comment} />}
    </section>
  );
}

function ResolutionSection({
  shift,
  reason,
}: {
  readonly shift: EmployeeBonusShiftView;
  readonly reason: ReasonOf;
}) {
  const resolution = shift.resolution;
  if (!resolution) return null;
  const reasonCode = reason(resolution.reasonCode);
  return (
    <section className="min-w-0">
      <h4 className="mb-1 text-sm font-semibold">{b.masterDecision}</h4>
      <Muted>
        {all.handover.resolutions[resolution.decision]} · {formatDateTime(resolution.at)}
        {reasonCode ? ` · ${reasonCode}` : ''}
      </Muted>
      <ScrollableText label={b.masterDecision} text={resolution.comment} />
    </section>
  );
}
