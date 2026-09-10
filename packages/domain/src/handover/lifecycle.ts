/** Статуси звіту передачі (ТЗ 5.9). */
export const HANDOVER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'ACCEPTED',
  'DISPUTED',
  'RESOLVED_ACCEPTED',
  'RESOLVED_ISSUE_CONFIRMED',
  'RESOLVED_NO_FAULT',
  'SUPERSEDED',
] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];

export const HANDOVER_RESOLUTIONS = [
  'RESOLVED_ACCEPTED',
  'RESOLVED_ISSUE_CONFIRMED',
  'RESOLVED_NO_FAULT',
] as const;
export type HandoverResolution = (typeof HANDOVER_RESOLUTIONS)[number];

const TRANSITIONS: Readonly<Record<HandoverStatus, readonly HandoverStatus[]>> = {
  DRAFT: ['SUBMITTED', 'SUPERSEDED'],
  /**
   * The master's two decisions, plus a return to work (FR-HND-07). Confirming a remark used to be
   * reachable only from a dispute, because the next shift raised it — since the next shift stopped
   * reviewing (2026-09-08) the master raises it themselves, straight from the submitted report.
   */
  SUBMITTED: [
    'ACCEPTED',
    'DISPUTED',
    'RESOLVED_ACCEPTED',
    'RESOLVED_ISSUE_CONFIRMED',
    'RESOLVED_NO_FAULT',
    'SUPERSEDED',
  ],
  DISPUTED: ['RESOLVED_ACCEPTED', 'RESOLVED_ISSUE_CONFIRMED', 'RESOLVED_NO_FAULT'],
  ACCEPTED: [],
  RESOLVED_ACCEPTED: [],
  RESOLVED_ISSUE_CONFIRMED: [],
  RESOLVED_NO_FAULT: [],
  SUPERSEDED: [],
};

export function canTransitionHandover(from: HandoverStatus, to: HandoverStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Статуси, за яких звіт ще чекає на рішення: показуються в черзі приймання і майстра. */
export function isHandoverPending(status: HandoverStatus): boolean {
  return status === 'SUBMITTED' || status === 'DISPUTED';
}

/** Вплив на бонус (ТЗ 5.9): попередній до рішення, підтверджений, або без зниження. */
export type HandoverBonusEffect =
  'NOT_COMPUTED' | 'PRELIMINARY' | 'CONFIRMED' | 'UNDER_REVIEW' | 'PENALTY' | 'NO_PENALTY';

export function handoverBonusEffect(status: HandoverStatus): HandoverBonusEffect {
  switch (status) {
    case 'DRAFT':
    case 'SUPERSEDED':
      return 'NOT_COMPUTED';
    case 'SUBMITTED':
      return 'PRELIMINARY';
    case 'ACCEPTED':
    case 'RESOLVED_ACCEPTED':
      return 'CONFIRMED';
    case 'DISPUTED':
      return 'UNDER_REVIEW';
    case 'RESOLVED_ISSUE_CONFIRMED':
      return 'PENALTY';
    case 'RESOLVED_NO_FAULT':
      return 'NO_PENALTY';
  }
}

/** T-32: сдавач не може прийняти власну передачу. */
export function canReview(reviewerEmployeeId: string, submittedBy: string): boolean {
  return reviewerEmployeeId !== submittedBy;
}

/**
 * Master review deadline is anchored to the shift plan, even when the report arrives late.
 * Missing historical plans fall back to submission time; they must not invent a shift boundary.
 */
export function acceptDeadline(
  submittedAt: Date,
  planEndAt: Date | null,
  reviewWindowMinutes: number,
): Date {
  const base = planEndAt ?? submittedAt;
  return new Date(base.getTime() + reviewWindowMinutes * 60_000);
}
