import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, photoObjects, sql, type Database, type DbOrTx } from '@vakhta/db';
import { CreatePhotoObject, PhotoObjectsView, PhotoObjectView } from '@vakhta/contracts';
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
      const [existing] = await tx
        .select()
        .from(photoObjects)
        .where(sql`lower(${photoObjects.name}) = lower(${name})`);
      if (existing) {
        if (!existing.active)
          await tx
            .update(photoObjects)
            .set({ active: true })
            .where(eq(photoObjects.id, existing.id));
        return PhotoObjectView.parse({ ...existing, active: true });
      }
      const [created] = await tx
        .insert(photoObjects)
        .values({ name, updatedBy: user.id })
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
}
