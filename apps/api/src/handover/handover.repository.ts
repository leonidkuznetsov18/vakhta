import { Injectable } from '@nestjs/common';
import {
  and,
  checklistDefinitions,
  desc,
  eq,
  handoverRecords,
  inArray,
  isNull,
  responsibilityZones,
  type DbOrTx,
} from '@vakhta/db';
import { DEFAULT_CHECKLIST_KEYS, type ChecklistItemDefinition } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';

type SessionLike = {
  readonly id: string;
  readonly employeeId: string;
  readonly zoneId: string | null;
};
type RecordRow = typeof handoverRecords.$inferSelect;
type DefinitionRow = typeof checklistDefinitions.$inferSelect;

const t = messages('ru');

/**
 * Мінімум операцій зі звітом передачі, потрібних машині зміни (ТЗ 4.4, FR-HND-07): без залежностей
 * від інших сервісів, щоб ShiftService і HandoverService не утворювали цикл.
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

  /** Guard SUBMIT_HANDOVER: звіт поданий (FR-TIME-04). */
  async hasSubmitted(tx: DbOrTx, sessionId: string): Promise<boolean> {
    const row = await this.current(tx, sessionId);
    return row !== null && row.status !== 'DRAFT';
  }

  /** CLEANING_DONE → HANDOVER відкриває чернетку з чинним шаблоном чек-листа. */
  async ensureDraft(tx: DbOrTx, session: SessionLike, now: Date): Promise<RecordRow | null> {
    if (!session.zoneId) return null;
    const existing = await this.current(tx, session.id);
    if (existing) return existing;
    const definition = await this.definitionFor(tx, session.zoneId);
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

  /** CONTINUE_WORK після звіту: звіт стає SUPERSEDED (FR-HND-07), новий буде створено на CLEANING_DONE. */
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

  /** Чинний шаблон за типом зони або загальний; за відсутності створює дефолтний з ТЗ 5.6. */
  async definitionFor(tx: DbOrTx, zoneId: string): Promise<DefinitionRow> {
    const [zone] = await tx
      .select({ type: responsibilityZones.type })
      .from(responsibilityZones)
      .where(eq(responsibilityZones.id, zoneId))
      .limit(1);
    const candidates = await tx
      .select()
      .from(checklistDefinitions)
      .where(and(eq(checklistDefinitions.isActive, true), isNull(checklistDefinitions.positionId)))
      .orderBy(desc(checklistDefinitions.version));
    const specific = zone ? candidates.find((d) => d.zoneType === zone.type) : undefined;
    const generic = candidates.find((d) => d.zoneType === null);
    if (specific ?? generic) return (specific ?? generic)!;
    const items: ChecklistItemDefinition[] = DEFAULT_CHECKLIST_KEYS.map((key) => ({
      key,
      label: t.handover.items[key],
      kind: key === 'MESSAGE_NEXT' ? 'NOTE' : 'CHECK',
    }));
    const [created] = await tx
      .insert(checklistDefinitions)
      .values({ version: 1, zoneType: null, items })
      .returning();
    if (!created) throw new Error('checklist_definitions: insert не повернув рядок');
    return created;
  }
}
