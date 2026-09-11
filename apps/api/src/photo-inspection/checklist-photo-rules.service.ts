import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  checklistDefinitions,
  checklistPhotoRules,
  eq,
  inArray,
  photoObjects,
  responsibilityZones,
  sql,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import {
  ChecklistPhotoRulesView,
  PhotoRule,
  SaveChecklistPhotoRules,
  type ChecklistPhotoRuleView,
} from '@vakhta/contracts';
import { z } from 'zod';
import { canActOn, HANDOVER_REVIEW_ROLES } from '@vakhta/domain';
import { DATABASE } from '../infra/database.module.js';
import { AuditLog } from '../events/audit-log.js';
import { type WebUser, webUserActor } from '../auth/web-auth.guard.js';
import { DomainError } from '../common/domain-error.js';

const StoredRules = z.array(PhotoRule);
/** Current rules of one checklist family in one zone, with catalog names resolved. */
export async function loadPhotoRules(
  db: DbOrTx,
  familyId: string,
  zoneId: string,
): Promise<{ version: number; rules: ChecklistPhotoRuleView[] }> {
  const [row] = await db
    .select()
    .from(checklistPhotoRules)
    .where(and(eq(checklistPhotoRules.familyId, familyId), eq(checklistPhotoRules.zoneId, zoneId)));
  const stored = StoredRules.parse(row?.rules ?? []);
  const objects = stored.length
    ? await db
        .select({ id: photoObjects.id, name: photoObjects.name })
        .from(photoObjects)
        .where(
          inArray(
            photoObjects.id,
            stored.map((rule) => rule.objectId),
          ),
        )
    : [];
  const names = new Map(objects.map((object) => [object.id, object.name]));
  return {
    version: row?.version ?? 0,
    rules: stored.flatMap((rule) => {
      const name = names.get(rule.objectId);
      return name === undefined ? [] : [{ ...rule, name }];
    }),
  };
}

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
    const loaded = await loadPhotoRules(this.db, source.definition.familyId, zoneId);
    return ChecklistPhotoRulesView.parse({ ...loaded, canEdit: source.canEdit });
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
      const known = input.rules.length
        ? await tx
            .select({ id: photoObjects.id })
            .from(photoObjects)
            .where(
              and(
                inArray(
                  photoObjects.id,
                  input.rules.map((rule) => rule.objectId),
                ),
                eq(photoObjects.active, true),
              ),
            )
        : [];
      if (known.length !== input.rules.length)
        throw new DomainError('PHOTO_OBJECT_NOT_FOUND', 422, 'Unknown or inactive object');
      const values = {
        rules: input.rules,
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
        before: row ? { zoneId, rules: row.rules, version: row.version } : null,
        after: { zoneId, ...values },
      });
    });
    return this.get(definitionId, zoneId, user);
  }
}
