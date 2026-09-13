import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { MediaQualityStatus } from '@vakhta/domain';
import { employees } from './identity.js';

const QUALITY_VALUES = [
  'PENDING',
  'OK',
  'LOW_RES',
  'DARK',
  'CORRUPT',
  'DUPLICATE_SUSPECT',
  'MANUAL_REVIEW',
] as const satisfies readonly MediaQualityStatus[];

export const mediaQuality = pgEnum('media_quality', QUALITY_VALUES);

/**
 * Фото у приватному сховищі (FR-PHO-02, ADR-0006): Telegram-ідентифікатори, метрики після
 * перенесення, статус технічної перевірки. Видача лише через підписані посилання.
 */
export const mediaObjects = pgTable(
  'media_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    telegramFileId: text('telegram_file_id').notNull(),
    telegramFileUniqueId: text('telegram_file_unique_id').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => employees.id),
    purpose: text('purpose').notNull(),
    storageKey: text('storage_key'),
    contentType: text('content_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    width: integer('width'),
    height: integer('height'),
    sha256: text('sha256'),
    phash: text('phash'),
    brightness: smallint('brightness'),
    quality: mediaQuality('quality').notNull().default('PENDING'),
    qualityNotes: text('quality_notes'),
    duplicateOfId: uuid('duplicate_of_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    retentionUntil: timestamp('retention_until', { withTimezone: true }),
  },
  (t) => [
    index('media_objects_sha_idx').on(t.sha256),
    index('media_objects_received_idx').on(t.receivedAt),
    index('media_objects_unique_file_idx').on(t.telegramFileUniqueId),
  ],
);
