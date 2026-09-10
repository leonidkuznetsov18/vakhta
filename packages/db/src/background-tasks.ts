import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { Database, Transaction } from './client.js';
import {
  BACKGROUND_TASK_ERROR_CODES,
  BACKGROUND_TASK_KINDS,
  backgroundTasks,
  type BackgroundTaskErrorCode,
  type BackgroundTaskKind,
} from './schema/background-tasks.js';

type TaskRow = typeof backgroundTasks.$inferSelect;

export type BackgroundTaskInput = {
  readonly payloadVersion: number;
  readonly dedupeKey: string;
  /** Dispatchers must validate this versioned JSON object with their concrete contract. */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly dueAt: Date;
} & (
  | {
      readonly kind: 'BONUS_RECALCULATE';
      readonly sourceEventId: string;
      readonly targetSessionId: string;
    }
  | {
      readonly kind: Exclude<BackgroundTaskKind, 'BONUS_RECALCULATE'>;
      readonly sourceEventId?: never;
      readonly targetSessionId?: never;
    }
);

export interface BackgroundTaskIdentity {
  readonly id: string;
  readonly leaseToken: string;
}

/** Returned data is not a substitute for runtime validation of a task's version and payload. */
export type BackgroundTaskLease = Omit<TaskRow, 'status' | 'leaseToken' | 'leaseUntil'> & {
  readonly status: 'RUNNING';
  readonly leaseToken: string;
  readonly leaseUntil: Date;
};

export class BackgroundTaskLeaseLostError extends Error {
  constructor() {
    super('Background task lease is no longer owned');
    this.name = 'BackgroundTaskLeaseLostError';
  }
}

/** Call with the source transaction. A duplicate preserves every field of its original intent. */
export async function enqueueBackgroundTask(
  tx: Transaction,
  input: BackgroundTaskInput,
): Promise<{ id: string; created: boolean }> {
  if (
    !BACKGROUND_TASK_KINDS.includes(input.kind) ||
    !Number.isFinite(input.dueAt.getTime()) ||
    !Number.isSafeInteger(input.payloadVersion) ||
    input.payloadVersion < 1 ||
    input.dedupeKey.length < 1 ||
    input.dedupeKey.length > 250 ||
    typeof input.payload !== 'object' ||
    input.payload === null ||
    Array.isArray(input.payload)
  ) {
    throw new Error('Invalid background task intent');
  }
  const sourceEventId = input.sourceEventId ?? null;
  const targetSessionId = input.targetSessionId ?? null;
  const [inserted] = await tx
    .insert(backgroundTasks)
    .values({
      kind: input.kind,
      payloadVersion: input.payloadVersion,
      dedupeKey: input.dedupeKey,
      payload: input.payload,
      dueAt: input.dueAt,
      sourceEventId,
      targetSessionId,
      availableAt: input.dueAt,
    })
    .onConflictDoNothing()
    .returning({ id: backgroundTasks.id });
  if (inserted) return { id: inserted.id, created: true };

  const [existing] = await tx
    .select({ id: backgroundTasks.id })
    .from(backgroundTasks)
    .where(
      and(
        eq(backgroundTasks.dedupeKey, input.dedupeKey),
        eq(backgroundTasks.kind, input.kind),
        eq(backgroundTasks.payloadVersion, input.payloadVersion),
        eq(backgroundTasks.payload, input.payload),
        eq(backgroundTasks.dueAt, input.dueAt),
        sourceEventId === null
          ? isNull(backgroundTasks.sourceEventId)
          : eq(backgroundTasks.sourceEventId, sourceEventId),
        targetSessionId === null
          ? isNull(backgroundTasks.targetSessionId)
          : eq(backgroundTasks.targetSessionId, targetSessionId),
      ),
    );
  if (!existing) throw new Error('Background task intent conflicts with its deduplication key');
  return { id: existing.id, created: false };
}

function boundedInteger(value: number, max: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`Invalid background task ${label}`);
  }
}

function leasePredicate(lease: BackgroundTaskIdentity) {
  return and(
    eq(backgroundTasks.id, lease.id),
    eq(backgroundTasks.leaseToken, lease.leaseToken),
    eq(backgroundTasks.status, 'RUNNING'),
    sql`${backgroundTasks.leaseUntil} > clock_timestamp()`,
  );
}

function ownedLease(row: TaskRow | undefined): BackgroundTaskLease {
  if (!row || row.status !== 'RUNNING' || !row.leaseToken || !row.leaseUntil) {
    throw new BackgroundTaskLeaseLostError();
  }
  return { ...row, status: row.status, leaseToken: row.leaseToken, leaseUntil: row.leaseUntil };
}

/** Claims and commits quickly; it does not run handlers or keep a connection during external I/O. */
export async function claimBackgroundTasks(
  db: Database,
  options: {
    readonly kinds: readonly BackgroundTaskKind[];
    readonly limit: number;
    readonly leaseMs: number;
  },
): Promise<BackgroundTaskLease[]> {
  boundedInteger(options.limit, 100, 'claim limit');
  boundedInteger(options.leaseMs, 300_000, 'lease duration');
  if (
    !options.kinds.length ||
    options.kinds.length > BACKGROUND_TASK_KINDS.length ||
    options.kinds.some((kind) => !BACKGROUND_TASK_KINDS.includes(kind))
  ) {
    throw new Error('Invalid background task kinds');
  }
  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: backgroundTasks.id })
      .from(backgroundTasks)
      .where(
        and(
          inArray(backgroundTasks.kind, [...options.kinds]),
          or(
            and(
              eq(backgroundTasks.status, 'PENDING'),
              lte(backgroundTasks.availableAt, sql`clock_timestamp()`),
            ),
            and(
              eq(backgroundTasks.status, 'RUNNING'),
              lte(backgroundTasks.leaseUntil, sql`clock_timestamp()`),
            ),
          ),
        ),
      )
      .orderBy(asc(backgroundTasks.availableAt), asc(backgroundTasks.id))
      .limit(options.limit)
      .for('no key update', { skipLocked: true });
    if (!candidates.length) return [];
    const rows = await tx
      .update(backgroundTasks)
      .set({
        status: 'RUNNING',
        attempts: sql`${backgroundTasks.attempts} + 1`,
        leaseToken: sql`gen_random_uuid()`,
        leaseUntil: sql`clock_timestamp() + ${options.leaseMs} * interval '1 millisecond'`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        inArray(
          backgroundTasks.id,
          candidates.map((row) => row.id),
        ),
      )
      .returning();
    return rows.map(ownedLease);
  });
}

/**
 * DB-only handler boundary: no network I/O, nested transactions or root-pool queries in effect.
 * The callback must use tx for all writes. A final wall-clock check rolls back its effects if the
 * lease expires while they run. Throwing also rolls back; retry metadata is recorded separately.
 */
export async function runBackgroundTask<T>(
  db: Database,
  lease: BackgroundTaskIdentity,
  effect: (tx: Transaction, task: BackgroundTaskLease) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: backgroundTasks.id })
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, lease.id))
      .for('no key update');
    // This is a separate statement: time spent waiting for the lock must count against the lease.
    const [row] = await tx.select().from(backgroundTasks).where(leasePredicate(lease));
    const task = ownedLease(row);
    const result = await effect(tx, task);
    const completed = await tx
      .update(backgroundTasks)
      .set({
        status: 'COMPLETED',
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: null,
        completedAt: sql`clock_timestamp()`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(leasePredicate(lease))
      .returning({ id: backgroundTasks.id });
    if (!completed.length) throw new BackgroundTaskLeaseLostError();
    return result;
  });
}

/** A stale failure must not reset the current owner's work. Only safe classifications are stored. */
export async function retryBackgroundTask(
  db: Database,
  lease: BackgroundTaskIdentity,
  options: { readonly delayMs: number; readonly errorCode: BackgroundTaskErrorCode },
): Promise<boolean> {
  boundedInteger(options.delayMs, 86_400_000, 'retry delay');
  if (!BACKGROUND_TASK_ERROR_CODES.includes(options.errorCode)) {
    throw new Error('Invalid background task error code');
  }
  return db.transaction(async (tx) => {
    await tx
      .select({ id: backgroundTasks.id })
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, lease.id))
      .for('no key update');
    const rows = await tx
      .update(backgroundTasks)
      .set({
        status: 'PENDING',
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: options.errorCode,
        availableAt: sql`greatest(${backgroundTasks.dueAt}, clock_timestamp() + ${options.delayMs} * interval '1 millisecond')`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(leasePredicate(lease))
      .returning({ id: backgroundTasks.id });
    return rows.length > 0;
  });
}

/** Heartbeat only during external I/O; do not renew from inside runBackgroundTask's transaction. */
export async function renewBackgroundTaskLease(
  db: Database,
  lease: BackgroundTaskIdentity,
  leaseMs: number,
): Promise<boolean> {
  boundedInteger(leaseMs, 300_000, 'lease duration');
  return db.transaction(async (tx) => {
    await tx
      .select({ id: backgroundTasks.id })
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, lease.id))
      .for('no key update');
    const rows = await tx
      .update(backgroundTasks)
      .set({
        leaseUntil: sql`greatest(${backgroundTasks.leaseUntil}, clock_timestamp() + ${leaseMs} * interval '1 millisecond')`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(leasePredicate(lease))
      .returning({ id: backgroundTasks.id });
    return rows.length > 0;
  });
}
