import { z } from 'zod';

export const Uuid = z.uuid();

/** Ключ ідемпотентності команди (ADR-3). Для Telegram це callback_query_id або update_id. */
export const IdempotencyKey = z.string().min(4).max(128);

/** Оптимістична версія shift_session (ТЗ 12.3). */
export const ExpectedVersion = z.number().int().nonnegative();

/** Коди причин із довідника reason_codes: UPPER_SNAKE_CASE, як у ТЗ. */
export const ReasonCode = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/);

export const Comment = z.string().trim().max(2000);

export const IsoDateTime = z.iso.datetime({ offset: true });

/** 'YYYY-MM-DD' у часовому поясі майданчика. */
export const BusinessDate = z.iso.date();

export const Base64UrlToken = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
