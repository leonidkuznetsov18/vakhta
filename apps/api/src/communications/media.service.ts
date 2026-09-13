import { createHash, randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { parseBuffer } from 'music-metadata';
import { and, communicationAttachments, eq, isNull, lt, type Database } from '@vakhta/db';
import { type WebUser } from '../auth/web-auth.guard.js';
import { DATABASE } from '../infra/database.module.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../infra/object-storage.js';
import { DomainError } from '../common/domain-error.js';
import { CommunicationsService } from './communications.service.js';
import { communicationScope } from './access.js';

export async function communicationFile(
  bytes: Buffer,
): Promise<{ bytes: Buffer; contentType: string; extension: string }> {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024)
    throw new DomainError('COMMUNICATION_FILE_SIZE', 413, 'File must be between 1 byte and 10 MiB');
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (jpeg || png || webp) {
    try {
      const image = await sharp(bytes, { limitInputPixels: 40_000_000, animated: false })
        .rotate()
        .resize(2560, 2560, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      return { bytes: image, contentType: 'image/jpeg', extension: 'jpg' };
    } catch {
      throw new DomainError('COMMUNICATION_FILE_INVALID', 400, 'Image cannot be decoded');
    }
  }
  if (
    bytes.toString('ascii', 0, 5) === '%PDF-' &&
    bytes.subarray(-1024).includes(Buffer.from('%%EOF'))
  ) {
    try {
      const document = await PDFDocument.load(bytes, { throwOnInvalidObject: true });
      if (!document.getPageCount()) throw new Error('Empty PDF');
      return { bytes, contentType: 'application/pdf', extension: 'pdf' };
    } catch {
      throw new DomainError('COMMUNICATION_FILE_INVALID', 400, 'PDF cannot be parsed');
    }
  }
  if (
    bytes.toString('ascii', 4, 8) === 'ftyp' &&
    ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(bytes.toString('ascii', 8, 12))
  ) {
    await validateRecording(bytes, 'video/mp4');
    return { bytes, contentType: 'video/mp4', extension: 'mp4' };
  }
  if (
    bytes.toString('ascii', 0, 3) === 'ID3' ||
    (bytes[0] === 255 && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
  ) {
    await validateRecording(bytes, 'audio/mpeg');
    return { bytes, contentType: 'audio/mpeg', extension: 'mp3' };
  }
  throw new DomainError('COMMUNICATION_FILE_INVALID', 400, 'Use JPEG, PNG, WebP, MP4, MP3 or PDF');
}

async function validateRecording(bytes: Buffer, contentType: string) {
  try {
    const result = await parseBuffer(
      bytes,
      { mimeType: contentType, size: bytes.length },
      { duration: true, skipCovers: true },
    );
    const valid =
      contentType === 'video/mp4'
        ? result.format.hasVideo && (result.format.trackInfo?.length ?? 0) > 0
        : (result.format.duration ?? 0) > 0;
    if (!valid) throw new Error('No recording tracks');
  } catch {
    throw new DomainError('COMMUNICATION_FILE_INVALID', 400, 'Recording cannot be parsed');
  }
}

@Injectable()
export class CommunicationMediaService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(CommunicationMediaService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private cleaning = false;
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage | null,
    private readonly communications: CommunicationsService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.cleanup();
    }, 60_000);
    this.timer.unref();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
  async upload(user: WebUser, filename: string, bytes: Buffer) {
    const scope = await communicationScope(this.db, user.id);
    if (
      !scope.all &&
      ![...scope.siteIds, ...scope.orgUnitIds, ...scope.teamIds, ...scope.zoneIds].length
    )
      throw new DomainError('OUT_OF_SCOPE', 403, 'No communication access');
    if (!this.storage?.put)
      throw new DomainError('COMMUNICATION_STORAGE_UNAVAILABLE', 503, 'Storage is unavailable');
    const file = await communicationFile(bytes);
    const id = randomUUID();
    const cleanName =
      [...filename]
        .map((character) =>
          character.charCodeAt(0) < 32 ||
          character.charCodeAt(0) === 127 ||
          character === '/' ||
          character === '\\'
            ? '_'
            : character,
        )
        .join('')
        .slice(0, 180)
        .replace(/\.[^.]+$/, '') || 'attachment';
    const savedName = `${cleanName}.${file.extension}`;
    const storageKey = `communications/${user.id}/${id}.${file.extension}`;
    const [row] = await this.db
      .insert(communicationAttachments)
      .values({
        id,
        ownerId: user.id,
        storageKey,
        filename: savedName,
        contentType: file.contentType,
        sizeBytes: file.bytes.length,
        sha256: createHash('sha256').update(file.bytes).digest('hex'),
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    if (!row) throw new Error('Attachment insert failed');
    await this.storage.put(storageKey, file.bytes, file.contentType);
    const saved = await this.db
      .update(communicationAttachments)
      .set({ status: 'READY' })
      .where(
        and(eq(communicationAttachments.id, id), eq(communicationAttachments.status, 'UPLOADING')),
      )
      .returning();
    if (!saved.length)
      throw new DomainError('COMMUNICATION_ATTACHMENT_INVALID', 409, 'Upload expired');
    return { id, filename: savedName, sizeBytes: file.bytes.length, contentType: file.contentType };
  }
  async link(user: WebUser, id: string) {
    const [row] = await this.db
      .select()
      .from(communicationAttachments)
      .where(eq(communicationAttachments.id, id));
    if (!row || row.ownerId !== user.id || row.status !== 'READY')
      throw new DomainError('COMMUNICATION_ATTACHMENT_INVALID', 404, 'Attachment unavailable');
    if (row.communicationId)
      await this.communications.requireVisible(this.db, user, row.communicationId);
    if (!row.communicationId && row.expiresAt <= new Date())
      throw new DomainError('COMMUNICATION_ATTACHMENT_INVALID', 404, 'Attachment expired');
    if (!this.storage)
      throw new DomainError('COMMUNICATION_STORAGE_UNAVAILABLE', 503, 'Storage unavailable');
    return { url: await this.storage.presignGet(row.storageKey, 60) };
  }
  async discard(user: WebUser, id: string) {
    await this.db
      .update(communicationAttachments)
      .set({ expiresAt: new Date() })
      .where(
        and(
          eq(communicationAttachments.id, id),
          eq(communicationAttachments.ownerId, user.id),
          isNull(communicationAttachments.communicationId),
        ),
      );
  }
  async cleanup() {
    if (this.cleaning || !this.storage?.delete) return;
    this.cleaning = true;
    try {
      const rows = await this.db.transaction(async (tx) => {
        const files = await tx
          .select()
          .from(communicationAttachments)
          .where(
            and(
              isNull(communicationAttachments.communicationId),
              lt(communicationAttachments.expiresAt, new Date()),
            ),
          )
          .limit(10)
          .for('update', { skipLocked: true });
        for (const file of files)
          await tx
            .update(communicationAttachments)
            .set({ status: 'DELETING' })
            .where(eq(communicationAttachments.id, file.id));
        return files;
      });
      for (const row of rows) {
        await this.storage.delete(row.storageKey);
        await this.db
          .delete(communicationAttachments)
          .where(
            and(
              eq(communicationAttachments.id, row.id),
              eq(communicationAttachments.status, 'DELETING'),
              isNull(communicationAttachments.communicationId),
            ),
          );
      }
    } catch (error) {
      // Staging records remain durable for the next cleanup attempt; never log object URLs.
      this.logger.error(
        'Communication attachment cleanup failed',
        error instanceof Error ? error.name : 'UnknownError',
      );
    } finally {
      this.cleaning = false;
    }
  }
}
