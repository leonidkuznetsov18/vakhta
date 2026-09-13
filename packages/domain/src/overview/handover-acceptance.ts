export interface HandoverOutcome {
  readonly status: string;
  /** The receiver opened a dispute at some point (status DISPUTED or an ISSUE review). */
  readonly disputed: boolean;
}

export interface HandoverAcceptanceSnapshot {
  /** Accepted without a dispute. */
  readonly clean: number;
  /** Accepted, disputed or resolved: the receiver or master has spoken. */
  readonly decided: number;
  readonly disputed: number;
  /** Submitted and waiting for the receiver or master. */
  readonly pending: number;
}

const DECIDED = new Set([
  'ACCEPTED',
  'DISPUTED',
  'RESOLVED_ACCEPTED',
  'RESOLVED_ISSUE_CONFIRMED',
  'RESOLVED_NO_FAULT',
]);

/** Handover acceptance into the current shift (spec 004 D-07); drafts and superseded ignored. */
export function handoverAcceptance(
  records: readonly HandoverOutcome[],
): HandoverAcceptanceSnapshot {
  const decided = records.filter((r) => DECIDED.has(r.status));
  const disputed = decided.filter((r) => r.disputed || r.status === 'DISPUTED');
  return {
    clean: decided.filter(
      (r) => !(r.disputed || r.status === 'DISPUTED') && r.status !== 'RESOLVED_ISSUE_CONFIRMED',
    ).length,
    decided: decided.length,
    disputed: disputed.length,
    pending: records.filter((r) => r.status === 'SUBMITTED').length,
  };
}
