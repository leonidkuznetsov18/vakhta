import { Injectable } from '@nestjs/common';
import {
  and,
  checklistDefinitionPositions,
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

  /**
   * CLEANING_DONE → HANDOVER opens a draft on the checklist bound to the employee position. No
   * checklist for the position (or no position): no draft, the shift is handed over without a
   * report. A shift without a zone still gets its checklist; the report then has no receiver and
   * goes straight to the master.
   */
  async ensureDraft(tx: DbOrTx, session: SessionLike, now: Date): Promise<RecordRow | null> {
    const existing = await this.current(tx, session.id);
    if (existing) return existing;
    const definition = await this.checklistFor(tx, session, now);
    if (!definition) return null;
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

  /** Whether the shift must hand in a report: a draft already exists or the position has a checklist. */
  async reportRequired(tx: DbOrTx, session: SessionLike, now: Date = new Date()): Promise<boolean> {
    if (await this.current(tx, session.id)) return true;
    return (await this.checklistFor(tx, session, now)) !== null;
  }

  /** The checklist of the employee position, refined by the zone type when one matches. */
  async checklistFor(
    tx: DbOrTx,
    session: SessionLike,
    now: Date = new Date(),
  ): Promise<DefinitionRow | null> {
    const positionId = await this.positionOf(tx, session, now);
    if (!positionId) return null;
    return this.definitionFor(tx, session.zoneId, positionId);
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
   * The active checklist of a position (spec 5.6, ADR-0012): the one for its zone type when the
   * shift has such a zone, otherwise the one for any zone type. Null when the position has none.
   */
  async definitionFor(
    tx: DbOrTx,
    zoneId: string | null,
    positionId: string,
  ): Promise<DefinitionRow | null> {
    const [zone] = zoneId
      ? await tx
          .select({ type: responsibilityZones.type })
          .from(responsibilityZones)
          .where(eq(responsibilityZones.id, zoneId))
          .limit(1)
      : [];
    const zoneType = zone?.type ?? null;
    const candidates = await tx
      .select({ d: checklistDefinitions })
      .from(checklistDefinitions)
      .innerJoin(
        checklistDefinitionPositions,
        eq(checklistDefinitionPositions.definitionId, checklistDefinitions.id),
      )
      .where(
        and(
          eq(checklistDefinitions.isActive, true),
          eq(checklistDefinitionPositions.positionId, positionId),
        ),
      )
      .orderBy(desc(checklistDefinitions.version), desc(checklistDefinitions.createdAt));
    const rows = candidates.map((c) => c.d);
    return (
      (zoneType ? rows.find((d) => d.zoneType === zoneType) : undefined) ??
      rows.find((d) => d.zoneType === null) ??
      null
    );
  }
}
