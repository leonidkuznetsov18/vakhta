import { AUTOMATIC_INSPECTION_ACTOR } from '@vakhta/contracts';
import { and, auditLog, domainEvents, eq, handoverRecords, sql, type Database } from '@vakhta/db';

const completed = sql`(exists (
  select 1 from photo_inspections pi join photo_inspection_runs pr on pr.inspection_id = pi.id
  join handover_media hm on hm.handover_id = pi.handover_id and hm.media_object_id = pi.media_id and hm.item_key = pi.item_key
  where pi.handover_id = ${handoverRecords.id} and pr.requested_by = ${AUTOMATIC_INSPECTION_ACTOR}
) or exists (
  select 1 from checklist_definitions cd join checklist_photo_rules rules on rules.family_id = cd.family_id
  where cd.id = ${handoverRecords.checklistDefinitionId} and rules.zone_id = ${handoverRecords.zoneId}
  and jsonb_array_length(rules.items) > 0
  and exists (select 1 from handover_media hm where hm.handover_id = ${handoverRecords.id})
)) and not exists (
  select 1 from handover_media hm join media_objects mo on mo.id = hm.media_object_id
  where hm.handover_id = ${handoverRecords.id} and mo.quality <> 'CORRUPT' and not exists (
    select 1 from photo_inspections pi join photo_inspection_runs pr on pr.inspection_id = pi.id
    where pi.handover_id = hm.handover_id and pi.media_id = hm.media_object_id and pi.item_key = hm.item_key
    and pr.requested_by = ${AUTOMATIC_INSPECTION_ACTOR} and pr.status in ('SUCCEEDED', 'FAILED')
  )
)`;
/** Terminal AI failures still go to a human; they never imply a clean photo. */
export async function advanceCompletedPhotoReviews(db: Database): Promise<number> {
  return db.transaction(async (tx) => {
    const reports = await tx
      .select()
      .from(handoverRecords)
      .where(and(eq(handoverRecords.status, 'SUBMITTED'), completed))
      .limit(25)
      .for('update', { skipLocked: true });
    for (const report of reports) {
      await tx
        .update(handoverRecords)
        .set({ status: 'MASTER_REVIEW', version: report.version + 1, updatedAt: new Date() })
        .where(eq(handoverRecords.id, report.id));
      await tx.insert(domainEvents).values({
        type: 'HANDOVER_AI_REVIEW_READY',
        occurredAt: new Date(),
        source: 'SYSTEM',
        actingRole: 'SYSTEM',
        employeeId: report.submittedBy,
        shiftSessionId: report.shiftSessionId,
        zoneId: report.zoneId,
        idempotencyKey: `handover-ai-review:${report.id}`,
        payload: { handoverId: report.id },
      });
      await tx.insert(auditLog).values({
        actorType: 'SYSTEM',
        action: 'handover.ai_review_ready',
        objectType: 'handover',
        objectId: report.id,
        before: { status: 'SUBMITTED' },
        after: { status: 'MASTER_REVIEW' },
      });
    }
    return reports.length;
  });
}
