import { createHash } from 'node:crypto';

export type AcknowledgementScope = { kind: 'HOME' } | { kind: 'MONTH'; month: string };

export interface AcknowledgementSnapshot {
  readonly scope: AcknowledgementScope;
  readonly fingerprint: string;
  readonly pending: boolean;
}

interface SnapshotAssignment {
  readonly id: string;
  readonly scheduleVersionId: string;
  readonly planStartAt: Date;
  readonly planEndAt: Date;
  readonly zoneId: string | null;
}

/** Acknowledgement state is deliberately excluded: repeated taps confirm the same plan. */
export function acknowledgementSnapshot(
  employeeId: string,
  scope: AcknowledgementScope,
  rows: readonly { a: SnapshotAssignment; acknowledgedAt: Date | null }[],
): AcknowledgementSnapshot {
  const assignments = rows.map(({ a }) => [
    a.id,
    a.scheduleVersionId,
    a.planStartAt.toISOString(),
    a.planEndAt.toISOString(),
    a.zoneId,
  ]);
  assignments.sort((left, right) => {
    const a = JSON.stringify(left);
    const b = JSON.stringify(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const scopeIdentity = scope.kind === 'HOME' ? ['HOME'] : ['MONTH', scope.month];
  return {
    scope,
    fingerprint: createHash('sha256')
      .update(JSON.stringify(['schedule-ack:v1', employeeId, scopeIdentity, assignments]))
      .digest('base64url'),
    pending: rows.some((row) => row.acknowledgedAt === null),
  };
}
