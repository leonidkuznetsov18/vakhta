import { randomUUID } from 'node:crypto';
import {
  AUTOMATIC_INSPECTION_ACTOR,
  prohibitedPhotoInstruction,
  PhotoRuleDetails,
  AUTOMATIC_INSPECTION_PROMPT_VERSION,
  INSPECTION_MODEL,
  InspectionContext,
} from '@vakhta/contracts';
import {
  and,
  asc,
  auditLog,
  checklistDefinitions,
  checklistPhotoRules,
  count,
  enqueueBackgroundTask,
  eq,
  gte,
  handoverMedia,
  handoverRecords,
  isNotNull,
  mediaObjects,
  photoInspections,
  photoInspectionRuns,
  responsibilityZones,
  shiftSessions,
  sql,
  type Database,
} from '@vakhta/db';

/** The submitted report and processed attachment are durable admission intent, including after restart. */
export async function admitSubmittedPhotoInspections(db: Database): Promise<number> {
  const since = new Date(Date.now() - 86_400_000);
  const candidates = await db
    .select({ attachmentId: handoverMedia.id })
    .from(handoverMedia)
    .innerJoin(handoverRecords, eq(handoverRecords.id, handoverMedia.handoverId))
    .innerJoin(mediaObjects, eq(mediaObjects.id, handoverMedia.mediaObjectId))
    .innerJoin(
      checklistDefinitions,
      eq(checklistDefinitions.id, handoverRecords.checklistDefinitionId),
    )
    .leftJoin(
      checklistPhotoRules,
      and(
        eq(checklistPhotoRules.familyId, checklistDefinitions.familyId),
        eq(checklistPhotoRules.zoneId, handoverRecords.zoneId),
      ),
    )
    .where(
      and(
        eq(handoverRecords.status, 'SUBMITTED'),
        sql`(jsonb_array_length(${checklistPhotoRules.items}) > 0 or exists (
          select 1 from photo_inspections pi join photo_inspection_runs pr on pr.inspection_id = pi.id
          where pi.handover_id = ${handoverRecords.id} and pr.requested_by = ${AUTOMATIC_INSPECTION_ACTOR}
        ))`,
        isNotNull(mediaObjects.processedAt),
        isNotNull(mediaObjects.storageKey),
        isNotNull(mediaObjects.sha256),
        isNotNull(mediaObjects.width),
        isNotNull(mediaObjects.height),
        sql`not exists (
        select 1 from photo_inspections pi join photo_inspection_runs pr on pr.inspection_id = pi.id
        where pi.handover_id = ${handoverMedia.handoverId} and pi.media_id = ${handoverMedia.mediaObjectId}
          and pi.item_key = ${handoverMedia.itemKey}
          and (pr.requested_by = ${AUTOMATIC_INSPECTION_ACTOR} or pr.status = 'PENDING')
      )`,
        sql`(select count(*) from photo_inspections pi join photo_inspection_runs pr on pr.inspection_id = pi.id
          where pi.handover_id = ${handoverMedia.handoverId} and pi.media_id = ${handoverMedia.mediaObjectId}
            and pi.item_key = ${handoverMedia.itemKey} and pr.requested_at >= ${since.toISOString()}::timestamptz) < 5`,
      ),
    )
    .orderBy(asc(handoverRecords.submittedAt), asc(handoverMedia.id))
    .limit(25);
  let admitted = 0;
  for (const candidate of candidates) {
    const added = await db.transaction(async (tx) => {
      const [source] = await tx
        .select({
          attachment: handoverMedia,
          report: handoverRecords,
          media: mediaObjects,
          definition: checklistDefinitions,
          prohibitedItems: checklistPhotoRules.items,
          ruleDetails: checklistPhotoRules.details,
          zoneName: responsibilityZones.name,
          businessDate: shiftSessions.businessDate,
        })
        .from(handoverMedia)
        .innerJoin(handoverRecords, eq(handoverRecords.id, handoverMedia.handoverId))
        .innerJoin(mediaObjects, eq(mediaObjects.id, handoverMedia.mediaObjectId))
        .innerJoin(
          checklistDefinitions,
          eq(checklistDefinitions.id, handoverRecords.checklistDefinitionId),
        )
        .leftJoin(
          checklistPhotoRules,
          and(
            eq(checklistPhotoRules.familyId, checklistDefinitions.familyId),
            eq(checklistPhotoRules.zoneId, handoverRecords.zoneId),
          ),
        )
        .innerJoin(shiftSessions, eq(shiftSessions.id, handoverRecords.shiftSessionId))
        .leftJoin(responsibilityZones, eq(responsibilityZones.id, handoverRecords.zoneId))
        .where(
          and(
            eq(handoverMedia.id, candidate.attachmentId),
            eq(handoverRecords.status, 'SUBMITTED'),
          ),
        )
        .for('update', { of: [handoverRecords, handoverMedia], skipLocked: true });
      if (!source) return false;
      const { attachment, report, media, definition } = source;
      // The first admitted photo fixes the rules for the whole report, even if the master edits them mid-run.
      const [prior] = await tx
        .select({ guidance: photoInspectionRuns.guidance })
        .from(photoInspectionRuns)
        .innerJoin(photoInspections, eq(photoInspections.id, photoInspectionRuns.inspectionId))
        .where(
          and(
            eq(photoInspections.handoverId, report.id),
            eq(photoInspectionRuns.requestedBy, AUTOMATIC_INSPECTION_ACTOR),
          ),
        )
        .limit(1);
      const guidance =
        prior?.guidance ??
        prohibitedPhotoInstruction(
          source.prohibitedItems ?? [],
          PhotoRuleDetails.parse(source.ruleDetails ?? []),
        );
      const item = definition.items.find(
        (item) => item.key === attachment.itemKey && item.kind === 'PHOTO',
      );
      if (
        (!prior && !source.prohibitedItems?.length) ||
        !item ||
        !media.processedAt ||
        !media.storageKey ||
        !media.sha256 ||
        !media.width ||
        !media.height
      )
        return false;
      const context = InspectionContext.parse({
        schemaVersion: 1,
        handoverId: report.id,
        mediaId: media.id,
        itemKey: item.key,
        checklistDefinitionId: definition.id,
        checklistVersion: definition.version,
        photoLabel: item.label,
        checklist: definition.items
          .filter((item) => item.kind === 'CHECK')
          .map(({ key, label }) => ({ key, label })),
        zoneId: report.zoneId,
        zoneName: source.zoneName,
        shiftSessionId: report.shiftSessionId,
        businessDate: source.businessDate,
        sha256: media.sha256,
        encodedWidth: media.width,
        encodedHeight: media.height,
        contentType: media.contentType ?? 'application/octet-stream',
        orientationPolicy: 'EXIF_AUTO_ORIENT',
      });
      await tx
        .insert(photoInspections)
        .values({
          handoverId: report.id,
          mediaId: media.id,
          itemKey: item.key,
          context,
          review: { status: 'UNREVIEWED', annotations: [], comment: '', guidance: '' },
        })
        .onConflictDoNothing();
      const [inspection] = await tx
        .select()
        .from(photoInspections)
        .where(
          and(
            eq(photoInspections.handoverId, report.id),
            eq(photoInspections.mediaId, media.id),
            eq(photoInspections.itemKey, item.key),
          ),
        )
        .for('update');
      if (!inspection) throw new Error('Automatic inspection insert returned no row');
      const runs = await tx
        .select({
          requestedBy: photoInspectionRuns.requestedBy,
          status: photoInspectionRuns.status,
        })
        .from(photoInspectionRuns)
        .where(eq(photoInspectionRuns.inspectionId, inspection.id));
      if (
        runs.some(
          (run) => run.requestedBy === AUTOMATIC_INSPECTION_ACTOR || run.status === 'PENDING',
        )
      )
        return false;
      // Same lock and limits as manual admission: automation cannot bypass the cost budget.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(174923, 1)`);
      const since = new Date(Date.now() - 86_400_000);
      const [total] = await tx
        .select({ value: count() })
        .from(photoInspectionRuns)
        .where(gte(photoInspectionRuns.requestedAt, since));
      const [perPhoto] = await tx
        .select({ value: count() })
        .from(photoInspectionRuns)
        .where(
          and(
            eq(photoInspectionRuns.inspectionId, inspection.id),
            gte(photoInspectionRuns.requestedAt, since),
          ),
        );
      if ((total?.value ?? 0) >= 200 || (perPhoto?.value ?? 0) >= 5) return false;
      const runId = randomUUID();
      await tx.insert(photoInspectionRuns).values({
        id: runId,
        inspectionId: inspection.id,
        context,
        reviewVersion: inspection.version,
        guidance,
        model: INSPECTION_MODEL,
        promptVersion: AUTOMATIC_INSPECTION_PROMPT_VERSION,
        requestedBy: AUTOMATIC_INSPECTION_ACTOR,
      });
      await enqueueBackgroundTask(tx, {
        kind: 'PHOTO_INSPECT',
        payloadVersion: 1,
        dedupeKey: `photo-inspect.${runId}`,
        payload: { runId },
        dueAt: new Date(),
      });
      await tx.insert(auditLog).values({
        actorType: 'SYSTEM',
        action: 'photo_inspection.auto_analyze',
        objectType: 'photo_inspection',
        objectId: inspection.id,
        after: { runId, promptVersion: AUTOMATIC_INSPECTION_PROMPT_VERSION },
      });
      return true;
    });
    if (added) admitted++;
  }
  return admitted;
}
