import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { employees, eq, mediaObjects, type Database } from '@vakhta/db';
import { webUserActor, type WebUser } from '../auth/web-auth.guard.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../infra/object-storage.js';
import { employeeProfileAccess, PROFILE_EDITORS } from './employee-profile-access.js';

export const EMPLOYEE_AVATAR_MAX_BYTES = 10 * 1024 * 1024;

export async function normalizeEmployeeAvatar(bytes: Buffer): Promise<Buffer> {
  if (bytes.length > EMPLOYEE_AVATAR_MAX_BYTES)
    throw new DomainError('AVATAR_TOO_LARGE', 413, 'Avatar exceeds 10 MB');
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!jpeg && !png && !webp)
    throw new DomainError('AVATAR_INVALID', 400, 'Avatar must be JPEG, PNG or WebP');
  try {
    return await sharp(bytes, { limitInputPixels: 40_000_000, animated: false })
      .rotate()
      .resize(512, 512, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new DomainError('AVATAR_INVALID', 400, 'Avatar image could not be decoded');
  }
}

@Injectable()
export class EmployeeAvatarService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage | null,
    private readonly audit: AuditLog,
  ) {}

  async get(id: string, user: WebUser) {
    await employeeProfileAccess(this.db, id, user);
    const [row] = await this.db
      .select({ key: mediaObjects.storageKey })
      .from(employees)
      .innerJoin(mediaObjects, eq(mediaObjects.id, employees.avatarMediaId))
      .where(eq(employees.id, id));
    if (!row?.key) throw new DomainError('AVATAR_NOT_FOUND', 404, 'Avatar not set');
    if (!this.storage)
      throw new DomainError('AVATAR_STORAGE_UNAVAILABLE', 503, 'Avatar storage unavailable');
    return this.storage.presignGet(row.key, 60);
  }

  async save(id: string, bytes: Buffer | null, expectedVersion: string, user: WebUser) {
    await employeeProfileAccess(this.db, id, user, PROFILE_EDITORS);
    const normalized = bytes ? await normalizeEmployeeAvatar(bytes) : null;
    if (normalized && !this.storage?.put)
      throw new DomainError('AVATAR_STORAGE_UNAVAILABLE', 503, 'Avatar storage unavailable');
    const mediaId = randomUUID();
    const key = `employee-avatars/${id}/${mediaId}.webp`;
    // Persist the private object's cleanup deadline before PUT; a crash cannot lose its identity.
    if (normalized) {
      await this.db.insert(mediaObjects).values({
        id: mediaId,
        telegramFileId: `upload:${mediaId}`,
        telegramFileUniqueId: `upload:${mediaId}`,
        purpose: 'EMPLOYEE_AVATAR',
        storageKey: key,
        contentType: 'image/webp',
        sizeBytes: normalized.length,
        width: 512,
        height: 512,
        sha256: createHash('sha256').update(normalized).digest('hex'),
        quality: 'OK',
        processedAt: new Date(),
        retentionUntil: new Date(Date.now() + 3_600_000),
      });
      await this.storage?.put?.(key, normalized, 'image/webp');
    }
    await this.db.transaction(async (tx) => {
      const [employee] = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, id))
        .for('update');
      await employeeProfileAccess(tx, id, user, PROFILE_EDITORS);
      if (!employee) throw new DomainError('EMPLOYEE_NOT_FOUND', 404, 'Employee not found');
      if (employee.status === 'TERMINATED')
        throw new DomainError('EMPLOYEE_READ_ONLY', 409, 'Terminated employee is read-only');
      if (employee.updatedAt.toISOString() !== expectedVersion)
        throw new DomainError(
          'EMPLOYEE_VERSION_CONFLICT',
          409,
          'Employee changed; reload before saving',
        );
      if (normalized) {
        const [staged] = await tx
          .select()
          .from(mediaObjects)
          .where(eq(mediaObjects.id, mediaId))
          .for('update');
        if (!staged?.storageKey || !staged.retentionUntil || staged.retentionUntil <= new Date())
          throw new DomainError('AVATAR_UPLOAD_EXPIRED', 409, 'Avatar upload expired; retry');
        await tx
          .update(mediaObjects)
          .set({ retentionUntil: null })
          .where(eq(mediaObjects.id, mediaId));
      }
      await tx
        .update(employees)
        .set({ avatarMediaId: normalized ? mediaId : null, updatedAt: new Date() })
        .where(eq(employees.id, id));
      await this.audit.record(tx, {
        actor: webUserActor(user),
        action: normalized ? 'employee.avatar.set' : 'employee.avatar.remove',
        objectType: 'employee',
        objectId: id,
        after: { mediaId: normalized ? mediaId : null },
      });
      if (employee.avatarMediaId)
        await tx
          .update(mediaObjects)
          .set({ retentionUntil: new Date() })
          .where(eq(mediaObjects.id, employee.avatarMediaId));
    });
    return { avatarVersion: normalized ? mediaId : null };
  }
}
