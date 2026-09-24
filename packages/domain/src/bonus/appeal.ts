/** Refusals of a bonus appeal (spec 7.7); clients localize by code. */
export const AppealError = {
  NOT_ALLOWED: 'APPEAL_NOT_ALLOWED',
  ALREADY_OPEN: 'APPEAL_ALREADY_OPEN',
} as const;
export type AppealError = (typeof AppealError)[keyof typeof AppealError];

/** An appealed score waits for its decision; an unscored shift has nothing to appeal. */
const NOT_APPEALABLE: ReadonlySet<string> = new Set(['APPEALED', 'NOT_EVALUATED']);

/** The window is set in working days; two calendar days of slack cover a weekend inside it. */
const WEEKEND_SLACK_DAYS = 2;
const DAY_MS = 86_400_000;

export interface AppealableScore {
  /** Stored bonus score status (`bonus_score_status`). */
  readonly status: string;
  readonly computedAt: Date;
}

/** Whether the employee may still appeal a shift score (spec 7.7). */
export function canAppealScore(
  score: AppealableScore,
  now: Date,
  appealWindowDays: number,
): boolean {
  if (NOT_APPEALABLE.has(score.status)) return false;
  const ageDays = (now.getTime() - score.computedAt.getTime()) / DAY_MS;
  return ageDays <= appealWindowDays + WEEKEND_SLACK_DAYS;
}
