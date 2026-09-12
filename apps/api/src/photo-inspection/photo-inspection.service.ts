import { PHOTO_ANALYSIS_CONFIG, type PhotoAnalysisConfig } from '../config/photo-analysis.js';
import { analysisLimitReached, loadAnalysisLimits } from './analysis-limits.js';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  enqueueBackgroundTask,
  eq,
  gte,
  or,
  isNotNull,
  handoverMedia,
  handoverRecords,
  checklistDefinitions,
  mediaObjects,
  photoInspections,
  photoInspectionFeedback,
  photoInspectionRevisions,
  photoInspectionRuns,
  responsibilityZones,
  shiftSessions,
  shiftAssignments,
  orgUnits,
  sql,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import {
  INSPECTION_MODEL,
  INSPECTION_PROMPT_VERSION,
  InspectionContext,
  InspectionPrediction,
  InspectionReview,
  InspectionReviewInput,
  InspectionRules,
  PhotoInspectionView,
  SaveRunFeedback,
  type RequestInspectionAnalysis,
  type SaveInspection,
} from '@vakhta/contracts';
import { canActOn, HANDOVER_REVIEW_ROLES } from '@vakhta/domain';
import { type WebUser, webUserActor } from '../auth/web-auth.guard.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';
import { MediaService } from '../handover/media.service.js';
import { loadPhotoRules } from './checklist-photo-rules.service.js';

export interface InspectionIdentity {
  handoverId: string;
  mediaId: string;
  itemKey: string;
}
const VIEWERS = [...HANDOVER_REVIEW_ROLES, 'HR', 'AUDITOR'] as const;
const EMPTY_REVIEW: InspectionReview = {
  status: 'UNREVIEWED',
  annotations: [],
  comment: '',
  guidance: '',
  isReference: false,
  rejectedFindings: [],
};
const identityWhere = (id: InspectionIdentity) =>
  and(
    eq(photoInspections.handoverId, id.handoverId),
    eq(photoInspections.mediaId, id.mediaId),
    eq(photoInspections.itemKey, id.itemKey),
  );

@Injectable()
export class PhotoInspectionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
    private readonly media: MediaService,
    @Inject(PHOTO_ANALYSIS_CONFIG) private readonly analysisConfig: PhotoAnalysisConfig,
  ) {}

  private async source(db: DbOrTx, id: InspectionIdentity, user: WebUser, write = false) {
    const [source] = await db
      .select({
        media: mediaObjects,
        attachmentId: handoverMedia.id,
        savedContext: photoInspections.context,
        report: handoverRecords,
        definition: checklistDefinitions,
        zone: responsibilityZones,
        assignment: shiftAssignments,
        assignmentUnit: orgUnits,
        businessDate: shiftSessions.businessDate,
      })
      .from(handoverRecords)
      .innerJoin(mediaObjects, eq(mediaObjects.id, id.mediaId))
      .leftJoin(
        handoverMedia,
        and(
          eq(handoverMedia.handoverId, handoverRecords.id),
          eq(handoverMedia.mediaObjectId, id.mediaId),
          eq(handoverMedia.itemKey, id.itemKey),
        ),
      )
      .leftJoin(
        photoInspections,
        and(
          eq(photoInspections.handoverId, handoverRecords.id),
          eq(photoInspections.mediaId, id.mediaId),
          eq(photoInspections.itemKey, id.itemKey),
        ),
      )
      .innerJoin(
        checklistDefinitions,
        eq(checklistDefinitions.id, handoverRecords.checklistDefinitionId),
      )
      .innerJoin(shiftSessions, eq(shiftSessions.id, handoverRecords.shiftSessionId))
      .leftJoin(responsibilityZones, eq(responsibilityZones.id, handoverRecords.zoneId))
      .leftJoin(shiftAssignments, eq(shiftAssignments.id, shiftSessions.assignmentId))
      .leftJoin(orgUnits, eq(orgUnits.id, shiftAssignments.orgUnitId))
      .where(
        and(
          eq(handoverRecords.id, id.handoverId),
          or(
            isNotNull(handoverMedia.id),
            and(isNotNull(photoInspections.id), gte(photoInspections.version, 1)),
          ),
        ),
      );
    if (!source) throw new DomainError('INSPECTION_NOT_FOUND', 404, 'Photo attachment not found');
    const target = source.zone
      ? { siteId: source.zone.siteId, orgUnitId: source.zone.orgUnitId, zoneId: source.zone.id }
      : source.assignment && source.assignmentUnit
        ? {
            siteId: source.assignmentUnit.siteId,
            orgUnitId: source.assignmentUnit.id,
            ...(source.assignment.teamId ? { teamId: source.assignment.teamId } : {}),
          }
        : {};
    if (!canActOn(user.grants, write ? HANDOVER_REVIEW_ROLES : VIEWERS, target))
      throw new DomainError('INSPECTION_FORBIDDEN', 403, 'Photo inspection is outside your scope');
    if (
      !source.media.storageKey ||
      !source.media.sha256 ||
      !source.media.width ||
      !source.media.height
    )
      throw new DomainError('MEDIA_NOT_READY', 409, 'Photo processing is incomplete');
    const item = source.definition.items.find(
      (item) => item.key === id.itemKey && item.kind === 'PHOTO',
    );
    if (!item && !source.savedContext)
      throw new DomainError('INSPECTION_NOT_FOUND', 404, 'Checklist photo item not found');
    return {
      context: InspectionContext.parse(
        !source.attachmentId && source.savedContext
          ? source.savedContext
          : {
              schemaVersion: 1,
              ...id,
              checklistDefinitionId: source.definition.id,
              checklistVersion: source.definition.version,
              photoLabel: item?.label ?? InspectionContext.parse(source.savedContext).photoLabel,
              checklist: source.definition.items
                .filter((item) => item.kind === 'CHECK')
                .map(({ key, label }) => ({ key, label })),
              zoneId: source.report.zoneId,
              zoneName: source.zone?.name ?? null,
              shiftSessionId: source.report.shiftSessionId,
              businessDate: source.businessDate,
              sha256: source.media.sha256,
              encodedWidth: source.media.width,
              encodedHeight: source.media.height,
              contentType: source.media.contentType ?? 'application/octet-stream',
              orientationPolicy: 'EXIF_AUTO_ORIENT',
            },
      ),
      canEdit:
        source.attachmentId !== null &&
        source.report.status !== 'DRAFT' &&
        canActOn(user.grants, HANDOVER_REVIEW_ROLES, target),
      status: source.report.status,
      familyId: source.definition.familyId,
    };
  }

  async get(id: InspectionIdentity, user: WebUser): Promise<PhotoInspectionView> {
    const source = await this.source(this.db, id, user);
    const [row] = await this.db.select().from(photoInspections).where(identityWhere(id));
    const runs = row
      ? await this.db
          .select({
            run: photoInspectionRuns,
            feedback: {
              rating: photoInspectionFeedback.rating,
              comment: photoInspectionFeedback.comment,
            },
          })
          .from(photoInspectionRuns)
          .leftJoin(
            photoInspectionFeedback,
            and(
              eq(photoInspectionFeedback.runId, photoInspectionRuns.id),
              eq(photoInspectionFeedback.actorId, user.id),
            ),
          )
          .where(eq(photoInspectionRuns.inspectionId, row.id))
          .orderBy(desc(photoInspectionRuns.requestedAt), desc(photoInspectionRuns.id))
          .limit(10)
      : [];
    const rules = (await loadPhotoRules(this.db, source.familyId)).rules;
    return PhotoInspectionView.parse({
      rules,
      context: row?.context ?? source.context,
      canEdit: source.canEdit,
      version: row?.version ?? 0,
      review: row?.review ?? EMPTY_REVIEW,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      runs: runs.map(({ run, feedback }) => ({
        ...run,
        requestedAt: run.requestedAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        feedback: feedback?.rating ? { rating: feedback.rating, comment: feedback.comment } : null,
      })),
    });
  }

  async analysisLimits(id: InspectionIdentity, user: WebUser) {
    await this.source(this.db, id, user);
    const [row] = await this.db
      .select({ id: photoInspections.id })
      .from(photoInspections)
      .where(identityWhere(id));
    return loadAnalysisLimits(this.db, row?.id ?? null, this.analysisConfig);
  }

  private async editable(db: DbOrTx, id: InspectionIdentity, user: WebUser) {
    await db
      .select({ id: handoverMedia.id })
      .from(handoverMedia)
      .where(
        and(
          eq(handoverMedia.handoverId, id.handoverId),
          eq(handoverMedia.itemKey, id.itemKey),
          eq(handoverMedia.mediaObjectId, id.mediaId),
        ),
      )
      .for('update');
    const source = await this.source(db, id, user, true);
    if (!source.canEdit)
      throw new DomainError(
        'INSPECTION_READ_ONLY',
        409,
        'Draft or replaced photo cannot be edited',
      );
    await db
      .insert(photoInspections)
      .values({ ...id, context: source.context, review: EMPTY_REVIEW })
      .onConflictDoNothing();
    const [row] = await db.select().from(photoInspections).where(identityWhere(id)).for('update');
    if (!row) throw new Error('Inspection insert returned no row');
    if (InspectionContext.parse(row.context).sha256 !== source.context.sha256)
      throw new DomainError('INSPECTION_SOURCE_CHANGED', 409, 'Photo source changed');
    return { row, familyId: source.familyId };
  }

  async save(
    id: InspectionIdentity,
    input: SaveInspection,
    user: WebUser,
  ): Promise<PhotoInspectionView> {
    const review = InspectionReviewInput.parse(input.review);
    await this.db.transaction(async (tx) => {
      const { row } = await this.editable(tx, id, user);
      if (row.version !== input.version)
        throw new DomainError('INSPECTION_CONFLICT', 409, 'Review changed; reload before saving');
      const runIds = new Set([
        ...review.annotations.flatMap((a) => (a.sourceRunId ? [a.sourceRunId] : [])),
        ...review.rejectedFindings.map((r) => r.runId),
      ]);
      for (const runId of runIds) {
        const [run] = await tx
          .select({ id: photoInspectionRuns.id, prediction: photoInspectionRuns.prediction })
          .from(photoInspectionRuns)
          .where(
            and(
              eq(photoInspectionRuns.id, runId),
              eq(photoInspectionRuns.inspectionId, row.id),
              eq(photoInspectionRuns.status, 'SUCCEEDED'),
            ),
          );
        if (!run)
          throw new DomainError(
            'INSPECTION_INVALID_SOURCE',
            422,
            'Suggestion belongs to another inspection',
          );
        const findings = InspectionPrediction.parse(run.prediction).findings;
        for (const annotation of review.annotations) {
          if (annotation.sourceRunId !== runId || annotation.sourceFindingIndex === undefined)
            continue;
          if (!findings[annotation.sourceFindingIndex]?.geometry)
            throw new DomainError(
              'INSPECTION_INVALID_SOURCE',
              422,
              'Source finding must exist and have geometry',
            );
        }
        for (const rejected of review.rejectedFindings) {
          if (rejected.runId === runId && !findings[rejected.index])
            throw new DomainError(
              'INSPECTION_INVALID_SOURCE',
              422,
              'Rejected finding must exist in its run',
            );
        }
      }
      const version = row.version + 1;
      await tx
        .update(photoInspections)
        .set({ review, version, updatedBy: user.id, updatedAt: new Date() })
        .where(eq(photoInspections.id, row.id));
      await tx.insert(photoInspectionRevisions).values({
        inspectionId: row.id,
        version,
        review,
        actorId: user.id,
        durationMs: input.durationMs ?? null,
      });
      await this.audit.record(tx, {
        actor: webUserActor(user),
        action: 'photo_inspection.save',
        objectType: 'photo_inspection',
        objectId: row.id,
        after: {
          version,
          status: review.status,
          count: review.annotations.length,
          rejected: review.rejectedFindings.length,
        },
      });
    });
    return this.get(id, user);
  }

  async analyze(
    id: InspectionIdentity,
    input: RequestInspectionAnalysis,
    user: WebUser,
  ): Promise<PhotoInspectionView> {
    await this.db.transaction(async (tx) => {
      const { row, familyId } = await this.editable(tx, id, user);
      const [replay] = await tx
        .select()
        .from(photoInspectionRuns)
        .where(eq(photoInspectionRuns.id, input.requestId));
      if (replay) {
        if (replay.inspectionId !== row.id || replay.reviewVersion !== input.version)
          throw new DomainError(
            'INSPECTION_CONFLICT',
            409,
            'Analysis request identity already used',
          );
        return;
      }
      if (row.version !== input.version)
        throw new DomainError(
          'INSPECTION_CONFLICT',
          409,
          'Reload the current review version first',
        );
      const [pending] = await tx
        .select({ id: photoInspectionRuns.id })
        .from(photoInspectionRuns)
        .where(
          and(
            eq(photoInspectionRuns.inspectionId, row.id),
            eq(photoInspectionRuns.status, 'PENDING'),
          ),
        );
      if (pending)
        throw new DomainError('INSPECTION_PENDING', 409, 'Another analysis is already pending');
      // The model only ever searches for what the checklist form names.
      const rules = (await loadPhotoRules(tx, familyId)).rules;
      const snapshot = InspectionRules.safeParse(rules);
      if (!snapshot.success)
        throw new DomainError(
          'INSPECTION_RULES_MISSING',
          409,
          'Configure the checklist object list for this zone before analysis',
        );
      // Serializes admission across photos and API replicas; limits include pending and failed runs.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(174923, 1)`);
      const limits = await loadAnalysisLimits(tx, row.id, this.analysisConfig);
      if (analysisLimitReached(limits))
        throw new DomainError('INSPECTION_LIMIT', 409, 'Daily photo analysis limit reached');
      const now = new Date();
      await tx.insert(photoInspectionRuns).values({
        id: input.requestId,
        inspectionId: row.id,
        reviewVersion: row.version,
        context: row.context,
        guidance: JSON.stringify(snapshot.data),
        model: INSPECTION_MODEL,
        promptVersion: INSPECTION_PROMPT_VERSION,
        requestedBy: user.id,
        requestedAt: now,
      });
      await enqueueBackgroundTask(tx, {
        kind: 'PHOTO_INSPECT',
        payloadVersion: 1,
        dedupeKey: `photo-inspect.${input.requestId}`,
        payload: { runId: input.requestId },
        dueAt: now,
      });
      await this.audit.record(tx, {
        actor: webUserActor(user),
        action: 'photo_inspection.analyze',
        objectType: 'photo_inspection',
        objectId: row.id,
        after: { runId: input.requestId, model: INSPECTION_MODEL },
      });
    });
    return this.get(id, user);
  }

  /** One rating per reviewer and run; a second opinion replaces the first. Never touches the review. */
  async rateRun(
    id: InspectionIdentity,
    runId: string,
    input: SaveRunFeedback,
    user: WebUser,
  ): Promise<PhotoInspectionView> {
    const feedback = SaveRunFeedback.parse(input);
    await this.db.transaction(async (tx) => {
      await this.source(tx, id, user, true);
      const [row] = await tx
        .select({ id: photoInspections.id })
        .from(photoInspections)
        .where(identityWhere(id));
      const [run] = row
        ? await tx
            .select({ id: photoInspectionRuns.id, status: photoInspectionRuns.status })
            .from(photoInspectionRuns)
            .where(
              and(eq(photoInspectionRuns.id, runId), eq(photoInspectionRuns.inspectionId, row.id)),
            )
        : [];
      if (!run || run.status === 'PENDING')
        throw new DomainError(
          'INSPECTION_INVALID_SOURCE',
          422,
          'Rate a finished run of this photo',
        );
      const values = {
        rating: feedback.rating,
        comment: feedback.comment || null,
        updatedAt: new Date(),
      };
      await tx
        .insert(photoInspectionFeedback)
        .values({ runId, actorId: user.id, ...values })
        .onConflictDoUpdate({
          target: [photoInspectionFeedback.runId, photoInspectionFeedback.actorId],
          set: values,
        });
      await this.audit.record(tx, {
        actor: webUserActor(user),
        action: 'photo_inspection.rate_run',
        objectType: 'photo_inspection_run',
        objectId: runId,
        after: { rating: feedback.rating },
      });
    });
    return this.get(id, user);
  }

  async link(id: InspectionIdentity, user: WebUser) {
    await this.source(this.db, id, user);
    return this.media.link(id.mediaId, webUserActor(user));
  }

  async export(id: InspectionIdentity, user: WebUser) {
    const view = await this.get(id, user);
    if (view.review.status === 'UNREVIEWED')
      throw new DomainError('INSPECTION_UNREVIEWED', 409, 'Complete a human review before export');
    await this.audit.record(this.db, {
      actor: webUserActor(user),
      action: 'photo_inspection.export',
      objectType: 'media_object',
      objectId: id.mediaId,
      after: { version: view.version },
    });
    return {
      schemaVersion: 1,
      coordinateSpace: 'normalized-after-exif-auto-orientation',
      context: view.context,
      review: view.review,
      version: view.version,
      reviewerId: view.updatedBy,
      reviewedAt: view.updatedAt,
      imageFile: `${id.mediaId}.${view.context.contentType === 'image/jpeg' ? 'jpg' : view.context.contentType === 'image/png' ? 'png' : 'bin'}`,
      splitGroup: view.context.shiftSessionId,
    };
  }
}
