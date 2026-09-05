import { z } from 'zod';
import { ExpectedVersion, IsoDateTime } from './common.js';

/** Контекст головного екрана бота, ТЗ 5.1. */
export const ScreenContext = z.enum([
  'NOT_REGISTERED',
  'BEFORE_SHIFT',
  'ARRIVED',
  'IN_SHIFT',
  'CLOSING',
  'AFTER_SHIFT',
]);
export type ScreenContext = z.infer<typeof ScreenContext>;

export const ScreenAction = z.object({
  /** Код дії або команди, який повертається у callback data. */
  code: z.string().min(1).max(32),
  label: z.string().min(1).max(64),
  style: z.enum(['primary', 'secondary', 'danger']),
});
export type ScreenAction = z.infer<typeof ScreenAction>;

/**
 * Модель екрана рендериться сервером зі стану (ADR-11). Бот лише малює текст і кнопки,
 * причому взаємовиключні дії разом не показуються (FR-UI-01).
 */
export const ScreenModel = z.object({
  context: ScreenContext,
  headline: z.string(),
  lines: z.array(z.string()),
  actions: z.array(ScreenAction),
  /** Версія стану, яку кодують кнопки; застаріла кнопка повертає актуальний екран. */
  version: ExpectedVersion,
  serverTime: IsoDateTime,
});
export type ScreenModel = z.infer<typeof ScreenModel>;
