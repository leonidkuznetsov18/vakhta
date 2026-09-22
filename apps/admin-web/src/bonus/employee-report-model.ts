import { queryOptions } from '@tanstack/react-query';
import type {
  BonusHistoryBucket,
  EmployeeBonusReviewView,
  EmployeeBonusShiftView,
} from '@vakhta/contracts';
import type { HandoverResolution } from '@vakhta/domain';
import { formatMonthShort, formatTime } from '@/lib/format';
import { keys } from '@/lib/query';
import { bonusApi } from '../api.ts';

const TREND_MONTHS = 12;
const REMARK_RESOLUTION: HandoverResolution = 'RESOLVED_ISSUE_CONFIRMED';
const ISSUE_REVIEW: EmployeeBonusReviewView['decision'] = 'ISSUE';

export function employeeReportQuery(employeeId: string, month: string) {
  return queryOptions({
    queryKey: keys.bonusEmployee({ employeeId, month }),
    queryFn: () => bonusApi.employee(employeeId, month),
  });
}

/** The employee's points per month over the year that ends with the opened month. */
export function employeeTrendQuery(employeeId: string, month: string) {
  const range = trendRange(month);
  const filters = { from: range.from, to: range.to, groupBy: 'month' as const, employeeId };
  return queryOptions({
    queryKey: keys.bonusHistory(filters),
    queryFn: () => bonusApi.history(filters),
  });
}

/** The twelve months ending with the given one, as the history query wants them. */
export function trendRange(month: string): { from: string; to: string; months: string[] } {
  const [y = 0, m = 1] = month.split('-').map(Number);
  const months: string[] = [];
  for (let i = TREND_MONTHS - 1; i >= 0; i -= 1) {
    months.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  }
  const last = new Date(Date.UTC(y, m, 0));
  return { from: `${months[0]}-01`, to: last.toISOString().slice(0, 10), months };
}

/** Every month of the range gets a bar, so a quiet month reads as zero, not as a gap. */
export function trendBars(
  months: readonly string[],
  buckets: readonly BonusHistoryBucket[],
): { key: string; label: string; points: number }[] {
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket.points]));
  return months.map((key) => ({ key, label: formatMonthShort(key), points: byKey.get(key) ?? 0 }));
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
