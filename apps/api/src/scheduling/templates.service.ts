import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, shiftTemplates, type Database, type DbOrTx } from '@vakhta/db';
import type { CreateShiftTemplateCommand, ShiftTemplateView } from '@vakhta/contracts';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { isUniqueViolation } from '../common/pg-errors.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { OrgService } from '../org/org.service.js';

export type TemplateRecord = typeof shiftTemplates.$inferSelect;

/** Шаблони 12-годинних змін майданчика (ТЗ 3, 18 п. 3). */
@Injectable()
export class TemplatesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly org: OrgService,
  ) {}

  async list(siteId: string): Promise<ShiftTemplateView[]> {
    const rows = await this.db
      .select()
      .from(shiftTemplates)
      .where(eq(shiftTemplates.siteId, siteId))
      .orderBy(asc(shiftTemplates.code));
    return rows.map((r) => this.toView(r));
  }

  async activeBySite(siteId: string, tx: DbOrTx = this.db): Promise<Map<string, TemplateRecord>> {
    const rows = await tx
      .select()
      .from(shiftTemplates)
      .where(and(eq(shiftTemplates.siteId, siteId), eq(shiftTemplates.isActive, true)));
    return new Map(rows.map((r) => [r.id, r]));
  }

  async create(cmd: CreateShiftTemplateCommand, actor: Actor): Promise<ShiftTemplateView> {
    await this.org.requireSite(cmd.siteId);
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx.insert(shiftTemplates).values(cmd).returning();
        if (!row) throw new Error('shift_templates: insert не повернув рядок');
        await this.events.append(tx, {
          type: 'SHIFT_TEMPLATE_CREATED',
          source: 'WEB',
          actor,
          payload: { ...cmd, id: row.id },
        });
        await this.audit.record(tx, {
          actor,
          action: 'shift_template.create',
          objectType: 'shift_template',
          objectId: row.id,
          after: cmd,
        });
        return this.toView(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError('CODE_TAKEN', 409, `Шаблон ${cmd.code} уже існує на майданчику`);
      }
      throw error;
    }
  }

  toView(row: TemplateRecord): ShiftTemplateView {
    return {
      id: row.id,
      siteId: row.siteId,
      code: row.code,
      name: row.name,
      localStart: row.localStart,
      localEnd: row.localEnd,
      isNight: row.isNight,
      isActive: row.isActive,
    };
  }
}
