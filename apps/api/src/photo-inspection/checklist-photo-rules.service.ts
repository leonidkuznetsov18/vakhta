import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  checklistDefinitions,
  checklistPhotoRules,
  eq,
  responsibilityZones,
  sql,
  type Database,
} from '@vakhta/db';
import {
  ChecklistPhotoRulesView,
  PhotoRuleDetails,
  SaveChecklistPhotoRules,
} from '@vakhta/contracts';
import { canActOn, HANDOVER_REVIEW_ROLES } from '@vakhta/domain';
import { DATABASE } from '../infra/database.module.js';
import { AuditLog } from '../events/audit-log.js';
import { type WebUser, webUserActor } from '../auth/web-auth.guard.js';
import { DomainError } from '../common/domain-error.js';

@Injectable()
export class ChecklistPhotoRulesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
  ) {}
  private async source(definitionId: string, zoneId: string, user: WebUser, write = false) {
    const [definition] = await this.db
      .select()
      .from(checklistDefinitions)
      .where(eq(checklistDefinitions.id, definitionId));
    const [zone] = await this.db
      .select()
      .from(responsibilityZones)
      .where(eq(responsibilityZones.id, zoneId));
    if (!definition || !zone)
      throw new DomainError('NOT_FOUND', 404, 'Checklist or zone not found');
    const target = { siteId: zone.siteId, orgUnitId: zone.orgUnitId, zoneId };
    if (
      !canActOn(
        user.grants,
        write ? HANDOVER_REVIEW_ROLES : [...HANDOVER_REVIEW_ROLES, 'AUDITOR', 'HR'],
        target,
      )
    )
      throw new DomainError('INSPECTION_FORBIDDEN', 403, 'Zone is outside your scope');
    return { definition, canEdit: canActOn(user.grants, HANDOVER_REVIEW_ROLES, target) };
  }
  async get(definitionId: string, zoneId: string, user: WebUser): Promise<ChecklistPhotoRulesView> {
    const source = await this.source(definitionId, zoneId, user);
    const [row] = await this.db
      .select()
      .from(checklistPhotoRules)
      .where(
        and(
          eq(checklistPhotoRules.familyId, source.definition.familyId),
          eq(checklistPhotoRules.zoneId, zoneId),
        ),
      );
    return ChecklistPhotoRulesView.parse({
      items: row?.items ?? [],
      details: row?.details ?? [],
      version: row?.version ?? 0,
      canEdit: source.canEdit,
    });
  }
  async save(definitionId: string, zoneId: string, input: SaveChecklistPhotoRules, user: WebUser) {
    input = SaveChecklistPhotoRules.parse(input);
    const source = await this.source(definitionId, zoneId, user, true);
    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${source.definition.familyId + ':' + zoneId}, 0))`,
      );
      const condition = and(
        eq(checklistPhotoRules.familyId, source.definition.familyId),
        eq(checklistPhotoRules.zoneId, zoneId),
      );
      const [row] = await tx.select().from(checklistPhotoRules).where(condition).for('update');
      if ((row?.version ?? 0) !== input.version)
        throw new DomainError('INSPECTION_CONFLICT', 409, 'Rules changed; reload before saving');
      const values = {
        items: input.items,
        details:
          input.details ??
          PhotoRuleDetails.parse(row?.details ?? []).filter((detail) =>
            input.items.includes(detail.item),
          ),
        version: input.version + 1,
        updatedBy: user.id,
        updatedAt: new Date(),
      };
      if (row)
        await tx.update(checklistPhotoRules).set(values).where(eq(checklistPhotoRules.id, row.id));
      else
        await tx
          .insert(checklistPhotoRules)
          .values({ ...values, definitionId, familyId: source.definition.familyId, zoneId });
      await this.audit.record(tx, {
        actor: webUserActor(user),
        action: 'checklist.photo_rules.save',
        objectType: 'checklist',
        objectId: definitionId,
        before: row ? { zoneId, items: row.items, version: row.version } : null,
        after: { zoneId, ...values },
      });
    });
    return this.get(definitionId, zoneId, user);
  }
}
