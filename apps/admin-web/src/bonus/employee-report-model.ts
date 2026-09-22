import { queryOptions } from '@tanstack/react-query';
import type {
  EmployeeBonusReviewView,
  EmployeeBonusTrendMonth,
  EmployeeBonusShiftView,
} from '@vakhta/contracts';
import type { HandoverResolution } from '@vakhta/domain';
import { formatMonthShort, formatTime } from '@/lib/format';
import { keys } from '@/lib/query';
import { bonusApi } from '../api.ts';

const REMARK_RESOLUTION: HandoverResolution = 'RESOLVED_ISSUE_CONFIRMED';
const ISSUE_REVIEW: EmployeeBonusReviewView['decision'] = 'ISSUE';

export function employeeReportQuery(employeeId: string, month: string) {
  return queryOptions({
    queryKey: keys.bonusEmployee({ employeeId, month }),
    queryFn: () => bonusApi.employee(employeeId, month),
  });
}

/** One bar group per month: points and remarks side by side, the month in its short form. */
export function trendBars(
  trend: readonly EmployeeBonusTrendMonth[],
): { key: string; label: string; points: number; remarks: number }[] {
  return trend.map((m) => ({
    key: m.month,
    label: formatMonthShort(m.month),
    points: m.points,
    remarks: m.remarks,
  }));
}

export function isQuietTrend(trend: readonly EmployeeBonusTrendMonth[]): boolean {
  return trend.every((m) => m.points === 0 && m.remarks === 0);
}

/** The one line that says why a shift did or did not earn its point. */
export function remarkPreview(shift: EmployeeBonusShiftView): string | null {
  if (shift.resolution?.decision === REMARK_RESOLUTION) return shift.resolution.comment;
  if (shift.review?.decision === ISSUE_REVIEW) return shift.review.comment ?? shift.review.category;
  const own = shift.remarks[0];
  if (own) return own.text ?? own.label;
  return null;
}

export function isIssueReview(review: EmployeeBonusReviewView): boolean {
  return review.decision === ISSUE_REVIEW;
}

export function shiftTime(shift: EmployeeBonusShiftView): string {
  if (!shift.startedAt) return '—';
  return `${formatTime(shift.startedAt)}–${formatTime(shift.endedAt)}`;
}

export function hasRemarks(shift: EmployeeBonusShiftView): boolean {
  return shift.remarks.length > 0 || shift.review !== null || shift.resolution !== null;
}
