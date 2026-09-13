import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, schedulePatterns, sites, type Database } from '@vakhta/db';
import {
  PatternDefinition,
  type SavePatternCommand,
  type SchedulePatternView,
} from '@vakhta/contracts';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';

type PatternRow = typeof schedulePatterns.$inferSelect;

/** Named batch inputs per site (SC-26); loading one never changes or publishes a plan. */
@Injectable()
export class PatternsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
  ) {}

  async list(siteId: string): Promise<SchedulePatternView[]> {
    const rows = await this.db
      .select()
      .from(schedulePatterns)
      .where(eq(schedulePatterns.siteId, siteId))
      .orderBy(asc(schedulePatterns.name));
    return rows.flatMap((row) => {
      const view = this.toView(row);
      return view ? [view] : [];
    });
  }

  async save(cmd: SavePatternCommand, actor: Actor): Promise<SchedulePatternView> {
    return this.db.transaction(async (tx) => {
      const [site] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, cmd.siteId));
      if (!site) throw new DomainError('SITE_NOT_FOUND', 404, 'Site not found');
      const [existing] = await tx
        .select()
        .from(schedulePatterns)
        .where(and(eq(schedulePatterns.siteId, cmd.siteId), eq(schedulePatterns.name, cmd.name)));
      const [row] = existing
        ? await tx
            .update(schedulePatterns)
            .set({ definition: cmd.definition })
            .where(eq(schedulePatterns.id, existing.id))
            .returning()
        : await tx
            .insert(schedulePatterns)
            .values({
              siteId: cmd.siteId,
              name: cmd.name,
              definition: cmd.definition,
              createdBy: actor.id,
            })
            .returning();
      if (!row) throw new Error('schedule_patterns: write returned no row');
      await this.audit.record(tx, {
        actor,
        action: 'schedule.pattern.save',
        objectType: 'schedule_pattern',
        objectId: row.id,
        before: existing ? { definition: existing.definition } : null,
        after: { name: cmd.name, definition: cmd.definition },
      });
      const view = this.toView(row);
      if (!view) throw new Error('schedule_patterns: stored definition is invalid');
      return view;
    });
  }

  async remove(id: string, actor: Actor): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(schedulePatterns).where(eq(schedulePatterns.id, id));
      if (!row) throw new DomainError('PATTERN_NOT_FOUND', 404, 'Pattern not found');
      await tx.delete(schedulePatterns).where(eq(schedulePatterns.id, id));
      await this.audit.record(tx, {
        actor,
        action: 'schedule.pattern.remove',
        objectType: 'schedule_pattern',
        objectId: id,
        before: { name: row.name, definition: row.definition },
      });
    });
  }

  async siteOf(id: string): Promise<string> {
    const [row] = await this.db
      .select({ siteId: schedulePatterns.siteId })
      .from(schedulePatterns)
      .where(eq(schedulePatterns.id, id));
    if (!row) throw new DomainError('PATTERN_NOT_FOUND', 404, 'Pattern not found');
    return row.siteId;
  }

  private toView(row: PatternRow): SchedulePatternView | null {
    const definition = PatternDefinition.safeParse(row.definition);
    if (!definition.success) return null;
    return {
      id: row.id,
      siteId: row.siteId,
      name: row.name,
      definition: definition.data,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
