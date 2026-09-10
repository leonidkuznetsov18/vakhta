import { z } from 'zod';
import { activityIntervals, and, asc, domainEvents, eq, type DbOrTx } from '@vakhta/db';

const ProjectionOrder = z.object({ intervalOrder: z.array(z.uuid()) });

/** Projection may collapse timestamps; its immutable original order disambiguates later corrections. */
export async function orderedShiftIntervals(tx: DbOrTx, sessionId: string) {
  const rows = await tx
    .select()
    .from(activityIntervals)
    .where(eq(activityIntervals.shiftSessionId, sessionId))
    .orderBy(
      asc(activityIntervals.startedAt),
      asc(activityIntervals.createdAt),
      asc(activityIntervals.id),
    );
  const [projection] = await tx
    .select({ payload: domainEvents.payload })
    .from(domainEvents)
    .where(
      and(
        eq(domainEvents.shiftSessionId, sessionId),
        eq(domainEvents.type, 'SHIFT_AUTO_CLOSE_PROJECTED'),
      ),
    )
    .orderBy(asc(domainEvents.occurredAt), asc(domainEvents.id))
    .limit(1);
  if (!projection) return rows;
  const parsed = ProjectionOrder.safeParse(projection.payload);
  if (!parsed.success) throw new Error('Invalid estimated-closure interval order');
  const order = new Map(parsed.data.intervalOrder.map((id, index) => [id, index]));
  if (order.size !== parsed.data.intervalOrder.length || rows.some((row) => !order.has(row.id))) {
    throw new Error('Incomplete estimated-closure interval order');
  }
  return rows.sort(
    (a, b) =>
      a.startedAt.getTime() - b.startedAt.getTime() ||
      (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
}
