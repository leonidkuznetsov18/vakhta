import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  or,
  scheduleNotes,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import type {
  CreateScheduleNoteCommand,
  EmployeeNoteView,
  ScheduleNoteView,
  ScheduleNotesQuery,
} from '@vakhta/contracts';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';

type NoteRow = typeof scheduleNotes.$inferSelect;

/**
 * Notes of a unit month with an explicit audience (SC-39). PLANNERS notes never leave the panel;
 * EMPLOYEES notes reach the people they concern through the bot plan. Text is bounded in SQL.
 */
@Injectable()
export class NotesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
  ) {}

  async list(query: ScheduleNotesQuery): Promise<ScheduleNoteView[]> {
    const rows = await this.db
      .select()
      .from(scheduleNotes)
      .where(
        and(
          eq(scheduleNotes.siteId, query.siteId),
          eq(scheduleNotes.orgUnitId, query.orgUnitId),
          eq(scheduleNotes.periodMonth, query.periodMonth),
        ),
      )
      .orderBy(asc(scheduleNotes.businessDate), asc(scheduleNotes.createdAt));
    return rows.map(toView);
  }

  async create(cmd: CreateScheduleNoteCommand, actor: Actor): Promise<ScheduleNoteView> {
    if (cmd.businessDate && !cmd.businessDate.startsWith(cmd.periodMonth))
      throw new DomainError('DATE_OUTSIDE_MONTH', 422, 'The date lies outside the month');
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(scheduleNotes)
        .values({ ...cmd, createdBy: actor.id })
        .returning();
      if (!row) throw new Error('schedule_notes: insert returned no row');
      await this.audit.record(tx, {
        actor,
        action: 'schedule.note.create',
        objectType: 'schedule_note',
        objectId: row.id,
        after: {
          audience: cmd.audience,
          businessDate: cmd.businessDate,
          zoneId: cmd.zoneId,
          employeeId: cmd.employeeId,
          length: cmd.text.length,
        },
      });
      return toView(row);
    });
  }

  async remove(id: string, actor: Actor): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(scheduleNotes).where(eq(scheduleNotes.id, id));
      if (!row) throw new DomainError('NOTE_NOT_FOUND', 404, 'Note not found');
      await tx.delete(scheduleNotes).where(eq(scheduleNotes.id, id));
      await this.audit.record(tx, {
        actor,
        action: 'schedule.note.remove',
        objectType: 'schedule_note',
        objectId: id,
        before: { audience: row.audience, length: row.text.length },
      });
    });
  }

  async scopeOf(
    id: string,
  ): Promise<{ siteId: string; orgUnitId: string; createdBy: string | null }> {
    const [row] = await this.db
      .select({
        siteId: scheduleNotes.siteId,
        orgUnitId: scheduleNotes.orgUnitId,
        createdBy: scheduleNotes.createdBy,
      })
      .from(scheduleNotes)
      .where(eq(scheduleNotes.id, id));
    if (!row) throw new DomainError('NOTE_NOT_FOUND', 404, 'Note not found');
    return row;
  }
}

/** EMPLOYEES notes for one person's plan month: unit-wide, their zone-free date notes, or theirs. */
export async function loadEmployeeNotes(
  tx: DbOrTx,
  input: {
    readonly employeeId: string;
    readonly month: string;
    readonly orgUnitIds: readonly string[];
  },
): Promise<EmployeeNoteView[]> {
  if (input.orgUnitIds.length === 0) return [];
  const rows = await tx
    .select({ businessDate: scheduleNotes.businessDate, text: scheduleNotes.text })
    .from(scheduleNotes)
    .where(
      and(
        eq(scheduleNotes.audience, 'EMPLOYEES'),
        eq(scheduleNotes.periodMonth, input.month),
        inArray(scheduleNotes.orgUnitId, [...input.orgUnitIds]),
        or(eq(scheduleNotes.employeeId, input.employeeId), isNull(scheduleNotes.employeeId)),
      ),
    )
    .orderBy(asc(scheduleNotes.businessDate), asc(scheduleNotes.createdAt));
  return rows.map((row) => ({ date: row.businessDate, text: row.text }));
}

function toView(row: NoteRow): ScheduleNoteView {
  return {
    id: row.id,
    siteId: row.siteId,
    orgUnitId: row.orgUnitId,
    periodMonth: row.periodMonth,
    businessDate: row.businessDate,
    zoneId: row.zoneId,
    employeeId: row.employeeId,
    audience: row.audience,
    text: row.text,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}
