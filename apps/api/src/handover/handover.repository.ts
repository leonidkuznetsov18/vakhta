import { Injectable } from '@nestjs/common';
import {
  and,
  checklistDefinitions,
  desc,
  employeePositions,
  eq,
  gt,
  handoverRecords,
  inArray,
  isNull,
  or,
  responsibilityZones,
  shiftAssignments,
  type DbOrTx,
} from '@vakhta/db';
import { defaultChecklistItems } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';

type SessionLike = {
  readonly id: string;
  readonly employeeId: string;
  readonly zoneId: string | null;
  readonly assignmentId: string | null;
};
type RecordRow = typeof handoverRecords.$inferSelect;
type DefinitionRow = typeof checklistDefinitions.$inferSelect;

/**
 * The minimum of handover-record operations the shift machine needs (spec 4.4, FR-HND-07), free
 * of other services so ShiftService and HandoverService never form a cycle.
 */
@Injectable()
export class HandoverRepository {
  async current(tx: DbOrTx, sessionId: string): Promise<RecordRow | null> {
    const [row] = await tx
      .select()
      .from(handoverRecords)
      .where(
        and(
          eq(handoverRecords.shiftSessionId, sessionId),
          inArray(handoverRecords.status, ['DRAFT', 'SUBMITTED', 'DISPUTED']),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Guard SUBMIT_HANDOVER: the report is submitted (FR-TIME-04). */
  async hasSubmitted(tx: DbOrTx, sessionId: string): Promise<boolean> {
    const row = await this.current(tx, sessionId);
    return row !== null && row.status !== 'DRAFT';
  }

  /** CLEANING_DONE → HANDOVER opens a draft on the checklist that fits the employee and the zone. */
  async ensureDraft(tx: DbOrTx, session: SessionLike, now: Date): Promise<RecordRow | null> {
    if (!session.zoneId) return null;
    const existing = await this.current(tx, session.id);
    if (existing) return existing;
    const positionId = await this.positionOf(tx, session, now);
    const definition = await this.definitionFor(tx, session.zoneId, positionId);
    const [row] = await tx
      .insert(handoverRecords)
      .values({
        shiftSessionId: session.id,
        zoneId: session.zoneId,
        submittedBy: session.employeeId,
        checklistDefinitionId: definition.id,
        status: 'DRAFT',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    return row ?? (await this.current(tx, session.id));
  }

  /** CONTINUE_WORK after the report: it becomes SUPERSEDED (FR-HND-07); CLEANING_DONE opens a new one. */
  async supersede(tx: DbOrTx, sessionId: string, now: Date): Promise<RecordRow | null> {
    const current = await this.current(tx, sessionId);
    if (!current) return null;
    const [row] = await tx
      .update(handoverRecords)
      .set({ status: 'SUPERSEDED', updatedAt: now, version: current.version + 1 })
      .where(eq(handoverRecords.id, current.id))
      .returning();
    return row ?? null;
  }

  /**
   * The position the checklist is picked for: the one on the schedule assignment, otherwise the
   * employee's current position; null when the employee has none.
   */
  async positionOf(tx: DbOrTx, session: SessionLike, now: Date): Promise<string | null> {
    if (session.assignmentId) {
      const [assignment] = await tx
        .select({ positionId: shiftAssignments.positionId })
        .from(shiftAssignments)
        .where(eq(shiftAssignments.id, session.assignmentId))
        .limit(1);
      if (assignment?.positionId) return assignment.positionId;
    }
    const [current] = await tx
      .select({ positionId: employeePositions.positionId })
      .from(employeePositions)
      .where(
        and(
          eq(employeePositions.employeeId, session.employeeId),
          or(isNull(employeePositions.validTo), gt(employeePositions.validTo, now)),
        ),
      )
      .orderBy(desc(employeePositions.validFrom))
      .limit(1);
    return current?.positionId ?? null;
  }

  /**
   * The active checklist that fits best: position and zone type, then position only, then zone
   * type only, then the general one. Nothing defined yet: the default of spec 5.6 is created so
   * the handover never opens without a checklist.
   */
  async definitionFor(
    tx: DbOrTx,
    zoneId: string,
    positionId: string | null,
  ): Promise<DefinitionRow> {
    const [zone] = await tx
      .select({ type: responsibilityZones.type })
      .from(responsibilityZones)
      .where(eq(responsibilityZones.id, zoneId))
      .limit(1);
    const zoneType = zone?.type ?? null;
    const candidates = await tx
      .select()
      .from(checklistDefinitions)
      .where(eq(checklistDefinitions.isActive, true))
      .orderBy(desc(checklistDefinitions.version), desc(checklistDefinitions.createdAt));
    const pick = (position: string | null, type: typeof zoneType) =>
      candidates.find((d) => d.positionId === position && d.zoneType === type);
    const chosen =
      (positionId ? pick(positionId, zoneType) : undefined) ??
      (positionId ? pick(positionId, null) : undefined) ??
      pick(null, zoneType) ??
      pick(null, null);
    if (chosen) return chosen;
    const t = messages().handover;
    const [created] = await tx
      .insert(checklistDefinitions)
      .values({
        name: t.defaultName,
        version: 1,
        zoneType: null,
        positionId: null,
        items: defaultChecklistItems({ items: t.items, angles: t.angles }),
      })
      .returning();
    if (!created) throw new Error('checklist_definitions: insert returned no row');
    return created;
  }
}
