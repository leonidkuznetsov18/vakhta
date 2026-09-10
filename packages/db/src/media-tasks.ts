import { and, eq, ne } from 'drizzle-orm';
import { handoverMedia, handoverRecords } from './schema/handover.js';
import type { Transaction } from './client.js';
import { enqueueBackgroundTask } from './background-tasks.js';

/** Media admission is part of the photo's source transaction, including legacy row replays. */
export function enqueueMediaProcessing(
  tx: Transaction,
  media: { readonly id: string; readonly receivedAt: Date },
) {
  return enqueueBackgroundTask(tx, {
    kind: 'MEDIA_PROCESS',
    payloadVersion: 1,
    dedupeKey: `media.${media.id}`,
    payload: { mediaObjectId: media.id },
    dueAt: media.receivedAt,
  });
}

/** One score invalidation per committed source event and target; never coalesce newer input. */
export function enqueueBonusRecalculation(
  tx: Transaction,
  input: { readonly sourceEventId: string; readonly targetSessionId: string; readonly dueAt: Date },
) {
  return enqueueBackgroundTask(tx, {
    kind: 'BONUS_RECALCULATE',
    payloadVersion: 1,
    dedupeKey: `bonus:${input.sourceEventId}:${input.targetSessionId}`,
    payload: { sessionId: input.targetSessionId },
    sourceEventId: input.sourceEventId,
    targetSessionId: input.targetSessionId,
    dueAt: input.dueAt,
  });
}

/** Current legacy scoring consumes checklist-photo quality, not medical or incident photo quality. */
export async function enqueueMediaBonusRecalculations(
  tx: Transaction,
  mediaObjectId: string,
  event: { readonly id: string; readonly occurredAt: Date },
): Promise<number> {
  const targets = await tx
    .selectDistinct({ id: handoverRecords.shiftSessionId })
    .from(handoverMedia)
    .innerJoin(handoverRecords, eq(handoverMedia.handoverId, handoverRecords.id))
    .where(
      and(eq(handoverMedia.mediaObjectId, mediaObjectId), ne(handoverRecords.status, 'SUPERSEDED')),
    );
  let created = 0;
  for (const target of targets) {
    const result = await enqueueBonusRecalculation(tx, {
      sourceEventId: event.id,
      targetSessionId: target.id,
      dueAt: event.occurredAt,
    });
    if (result.created) created += 1;
  }
  return created;
}
