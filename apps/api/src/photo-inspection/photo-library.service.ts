import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  employees,
  eq,
  gte,
  lte,
  or,
  sql,
  photoInspections,
  handoverRecords,
  handoverMedia,
  mediaObjects,
  responsibilityZones,
  shiftSessions,
  shiftAssignments,
  orgUnits,
  type Database,
} from '@vakhta/db';
import {
  InspectionContext,
  InspectionReview,
  PhotoLibraryView,
  type PhotoLibraryQuery,
} from '@vakhta/contracts';
import { HANDOVER_REVIEW_ROLES } from '@vakhta/domain';
import type { WebUser } from '../auth/web-auth.guard.js';
import { DATABASE } from '../infra/database.module.js';

const VIEWERS = [...HANDOVER_REVIEW_ROLES, 'HR', 'AUDITOR'];
/** Matches the source inspection's zone-first scope, including historical zone-less assignments. */
function visibleTo(user: WebUser) {
  const grants = user.grants
    .filter((grant) => VIEWERS.includes(grant.role))
    .map((grant) => {
      if (grant.scopeType === 'ENTERPRISE') return sql`true`;
      if (!grant.scopeId) return sql`false`;
      switch (grant.scopeType) {
        case 'SITE':
          return sql`(case when ${responsibilityZones.id} is not null then ${responsibilityZones.siteId} else ${orgUnits.siteId} end) = ${grant.scopeId}`;
        case 'ORG_UNIT':
          return sql`(case when ${responsibilityZones.id} is not null then ${responsibilityZones.orgUnitId} else ${orgUnits.id} end) = ${grant.scopeId}`;
        case 'ZONE':
          return eq(responsibilityZones.id, grant.scopeId);
        case 'TEAM':
          return and(
            sql`${responsibilityZones.id} is null and ${orgUnits.id} is not null`,
            eq(shiftAssignments.teamId, grant.scopeId),
          );
      }
    });
  return grants.length ? or(...grants) : sql`false`;
}

@Injectable()
export class PhotoLibraryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(input: PhotoLibraryQuery, user: WebUser): Promise<PhotoLibraryView> {
    // Business dates are local shift dates; no browser/UTC boundary can change the filter.
    const search = `%${input.search.replace(/[\\%_]/g, '\\$&')}%`;
    const where = and(
      gte(photoInspections.version, 1),
      visibleTo(user),
      input.status ? sql`${photoInspections.review}->>'status' = ${input.status}` : undefined,
      input.from ? gte(shiftSessions.businessDate, input.from) : undefined,
      input.to ? lte(shiftSessions.businessDate, input.to) : undefined,
      input.search
        ? or(
            sql`${employees.fullName} ilike ${search}`,
            sql`${photoInspections.context}->>'zoneName' ilike ${search}`,
            sql`${photoInspections.context}->>'photoLabel' ilike ${search}`,
            sql`${photoInspections.review}->>'comment' ilike ${search}`,
            sql`exists (select 1 from jsonb_array_elements(${photoInspections.review}->'annotations') a where a->>'comment' ilike ${search})`,
          )
        : undefined,
    );
    return this.db.transaction(
      async (tx) => {
        const base = tx
          .select({
            inspection: photoInspections,
            media: mediaObjects,
            employee: employees.fullName,
            businessDate: shiftSessions.businessDate,
            attachmentId: handoverMedia.id,
          })
          .from(photoInspections)
          .innerJoin(handoverRecords, eq(handoverRecords.id, photoInspections.handoverId))
          .innerJoin(mediaObjects, eq(mediaObjects.id, photoInspections.mediaId))
          .innerJoin(shiftSessions, eq(shiftSessions.id, handoverRecords.shiftSessionId))
          .innerJoin(employees, eq(employees.id, handoverRecords.submittedBy))
          .leftJoin(responsibilityZones, eq(responsibilityZones.id, handoverRecords.zoneId))
          .leftJoin(shiftAssignments, eq(shiftAssignments.id, shiftSessions.assignmentId))
          .leftJoin(orgUnits, eq(orgUnits.id, shiftAssignments.orgUnitId))
          .leftJoin(
            handoverMedia,
            and(
              eq(handoverMedia.handoverId, photoInspections.handoverId),
              eq(handoverMedia.mediaObjectId, photoInspections.mediaId),
              eq(handoverMedia.itemKey, photoInspections.itemKey),
            ),
          )
          .where(where);
        const [totalRow] = await tx.select({ total: count() }).from(base.as('visible_photos'));
        const total = totalRow?.total ?? 0;
        const page = Math.min(input.page, Math.max(1, Math.ceil(total / input.pageSize)));
        const rows = await base
          .orderBy(desc(photoInspections.updatedAt), desc(photoInspections.id))
          .limit(input.pageSize)
          .offset((page - 1) * input.pageSize);
        return PhotoLibraryView.parse({
          total,
          page,
          pageSize: input.pageSize,
          rows: rows.map((row) => {
            const context = InspectionContext.parse(row.inspection.context);
            const review = InspectionReview.parse(row.inspection.review);
            return {
              id: row.inspection.id,
              handoverId: row.inspection.handoverId,
              photo: {
                itemKey: row.inspection.itemKey,
                label: context.photoLabel,
                media: {
                  ...row.media,
                  receivedAt: row.media.receivedAt.toISOString(),
                  processedAt: row.media.processedAt?.toISOString() ?? null,
                },
                inspection: { status: review.status, annotationCount: review.annotations.length },
              },
              status: review.status,
              annotationCount: review.annotations.length,
              remarks: [
                ...(review.comment ? [review.comment] : []),
                ...review.annotations.map((a) => a.comment),
              ],
              updatedAt: row.inspection.updatedAt?.toISOString() ?? null,
              businessDate: row.businessDate,
              zone: context.zoneName,
              employee: row.employee,
              archived: row.attachmentId === null,
            };
          }),
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
