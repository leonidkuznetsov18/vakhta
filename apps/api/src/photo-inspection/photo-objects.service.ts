import { Inject, Injectable } from '@nestjs/common';
import {
  asc,
  checklistPhotoRules,
  eq,
  photoObjects,
  sql,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import {
  CreatePhotoObject,
  PhotoObjectsView,
  PhotoObjectView,
  PhotoRule,
  UpdatePhotoObject,
  nextPhotoObjectColor,
  photoObjectKey,
} from '@vakhta/contracts';
import { z } from 'zod';
import { HANDOVER_REVIEW_ROLES } from '@vakhta/domain';
import { DATABASE } from '../infra/database.module.js';
import { AuditLog } from '../events/audit-log.js';
import { type WebUser, webUserActor } from '../auth/web-auth.guard.js';
import { DomainError } from '../common/domain-error.js';

/** Any reviewer may extend the shared catalog: it names object types, not employee actions. */
export function canEditPhotoObjects(user: WebUser): boolean {
  return user.grants.some((grant) => HANDOVER_REVIEW_ROLES.includes(grant.role));
}
export async function listPhotoObjects(db: DbOrTx): Promise<PhotoObjectView[]> {
  const rows = await db
    .select()
    .from(photoObjects)
    .orderBy(asc(sql`lower(${photoObjects.name})`));
  return rows.map((row) => PhotoObjectView.parse(row));
}

@Injectable()
export class PhotoObjectsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
  ) {}
  async list(user: WebUser): Promise<PhotoObjectsView> {
    return { objects: await listPhotoObjects(this.db), canEdit: canEditPhotoObjects(user) };
  }
  /** Creating an existing spelling returns that entry instead of a duplicate. */
  async create(input: CreatePhotoObject, user: WebUser): Promise<PhotoObjectView> {
    const { name } = CreatePhotoObject.parse(input);
    if (!canEditPhotoObjects(user))
      throw new DomainError('INSPECTION_FORBIDDEN', 403, 'Only reviewers can add objects');
    return this.db.transaction(async (tx) => {
      const catalog = await tx.select().from(photoObjects);
      const existing = catalog.find(
        (object) => photoObjectKey(object.name) === photoObjectKey(name),
      );
      if (existing) {
        if (!existing.active)
          await tx
            .update(photoObjects)
            .set({ active: true })
            .where(eq(photoObjects.id, existing.id));
        return PhotoObjectView.parse({ ...existing, active: true });
      }
      // The new object takes the color used least among active objects, so it stands apart from
      // the ones reviewers see most often.
      const color = nextPhotoObjectColor(
        catalog.filter((object) => object.active).map((object) => object.color),
      );
      const [created] = await tx
        .insert(photoObjects)
        .values({ name, color, updatedBy: user.id })
        .returning();
      if (!created) throw new Error('Photo object insert returned no row');
      await this.audit.record(tx, {
        actor: webUserActor(user),
        action: 'photo_object.create',
        objectType: 'photo_object',
        objectId: created.id,
        after: { name },
      });
      return PhotoObjectView.parse(created);
    });
  }
  /**
   * Rename keeps the id, so rules and regions follow the new spelling; a name that collides with
   * another entry's spelling family is refused. Retiring removes the object from every checklist
   * list at once (each list's version advances, so an open form sees a conflict instead of
   * silently re-adding it); saved regions keep the id and still resolve the name.
   */
  async update(id: string, input: UpdatePhotoObject, user: WebUser): Promise<PhotoObjectView> {
    const change = UpdatePhotoObject.parse(input);
    if (!canEditPhotoObjects(user))
      throw new DomainError('INSPECTION_FORBIDDEN', 403, 'Only reviewers can edit objects');
    return this.db.transaction(async (tx) => {
      const catalog = await tx.select().from(photoObjects);
      const current = catalog.find((object) => object.id === id);
      if (!current) throw new DomainError('PHOTO_OBJECT_NOT_FOUND', 404, 'Unknown photo object');
      if (
        change.name !== undefined &&
        catalog.some(
          (object) =>
            object.id !== id && photoObjectKey(object.name) === photoObjectKey(change.name!),
        )
      )
        throw new DomainError('PHOTO_OBJECT_EXISTS', 409, 'Another object has this spelling');
      const [updated] = await tx
        .update(photoObjects)
        .set({
          ...(change.name !== undefined ? { name: change.name } : {}),
          ...(change.active === false ? { active: false } : {}),
          updatedBy: user.id,
        })
        .where(eq(photoObjects.id, id))
        .returning();
      if (!updated) throw new Error('Photo object update returned no row');
      if (change.active === false) {
        const lists = await tx.select().from(checklistPhotoRules);
        for (const list of lists) {
          const rules = StoredPhotoRules.parse(list.rules);
          if (!rules.some((rule) => rule.objectId === id)) continue;
          await tx
            .update(checklistPhotoRules)
            .set({
              rules: rules.filter((rule) => rule.objectId !== id),
              version: list.version + 1,
              updatedBy: user.id,
            })
            .where(eq(checklistPhotoRules.id, list.id));
        }
      }
      await this.audit.record(tx, {
        actor: webUserActor(user),
        action: change.active === false ? 'photo_object.retire' : 'photo_object.rename',
        objectType: 'photo_object',
        objectId: id,
        before: { name: current.name, active: current.active },
        after: { name: updated.name, active: updated.active },
      });
      return PhotoObjectView.parse(updated);
    });
  }
}
const StoredPhotoRules = z.array(PhotoRule);
