import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  enqueueMediaProcessing,
  eq,
  mediaObjects,
  type Database,
  type DbOrTx,
  type Transaction,
} from '@vakhta/db';
import type { MediaLinkView, MediaObjectView } from '@vakhta/contracts';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../infra/object-storage.js';

export interface MediaOptions {
  readonly linkTtlSeconds: number;
}
export const MEDIA_OPTIONS = Symbol('MEDIA_OPTIONS');

type MediaRow = typeof mediaObjects.$inferSelect;

export interface RegisterMediaInput {
  readonly telegramFileId: string;
  readonly telegramFileUniqueId: string;
  readonly uploadedBy: string;
  readonly purpose: string;
  readonly sizeBytes?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly now: Date;
}

/**
 * Registers Telegram evidence and its durable processing intent in the caller's transaction.
 * The worker copies evidence into private storage; authorized readers receive audited links.
 */
@Injectable()
export class MediaService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
    @Inject(MEDIA_OPTIONS) private readonly options: MediaOptions,
    @Optional() @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage | null = null,
  ) {}

  /** Repeated attachment preserves the original media identity and receipt deadline (FR-PHO-05). */
  async register(tx: Transaction, input: RegisterMediaInput): Promise<MediaRow> {
    const [existing] = await tx
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.telegramFileUniqueId, input.telegramFileUniqueId))
      .limit(1);
    if (
      existing &&
      existing.uploadedBy === input.uploadedBy &&
      existing.purpose === input.purpose
    ) {
      await enqueueMediaProcessing(tx, existing);
      return existing;
    }
    const [row] = await tx
      .insert(mediaObjects)
      .values({
        telegramFileId: input.telegramFileId,
        telegramFileUniqueId: input.telegramFileUniqueId,
        uploadedBy: input.uploadedBy,
        purpose: input.purpose,
        sizeBytes: input.sizeBytes ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        receivedAt: input.now,
      })
      .returning();
    if (!row) throw new Error('media_objects: insert не повернув рядок');
    await enqueueMediaProcessing(tx, row);
    return row;
  }

  async get(id: string, tx: DbOrTx = this.db): Promise<MediaRow | null> {
    const [row] = await tx.select().from(mediaObjects).where(eq(mediaObjects.id, id)).limit(1);
    return row ?? null;
  }

  /** Підписане посилання з TTL; кожен перегляд в аудиті (FR-PHO-06, ТЗ 13). */
  async link(id: string, actor: Actor, now: Date = new Date()): Promise<MediaLinkView> {
    const row = await this.get(id);
    if (!row) throw new DomainError('MEDIA_NOT_FOUND', 404, 'Фото не знайдено');
    if (!row.storageKey)
      throw new DomainError('MEDIA_NOT_READY', 409, 'Фото ще не перенесено у сховище');
    if (!this.storage)
      throw new DomainError('STORAGE_NOT_CONFIGURED', 503, 'Сховище фото не налаштовано');
    const url = await this.storage.presignGet(row.storageKey, this.options.linkTtlSeconds);
    await this.audit.record(this.db, {
      actor,
      action: 'media.view',
      objectType: 'media_object',
      objectId: id,
      after: { purpose: row.purpose, ttlSeconds: this.options.linkTtlSeconds },
    });
    return {
      url,
      expiresAt: new Date(now.getTime() + this.options.linkTtlSeconds * 1000).toISOString(),
    };
  }

  toView(row: MediaRow): MediaObjectView {
    return {
      id: row.id,
      quality: row.quality,
      width: row.width,
      height: row.height,
      receivedAt: row.receivedAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null,
      duplicateOfId: row.duplicateOfId,
    };
  }
}
