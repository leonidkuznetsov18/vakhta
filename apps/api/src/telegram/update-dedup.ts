import { Inject, Injectable } from '@nestjs/common';
import { eq, processedTelegramUpdates, type Database } from '@vakhta/db';
import { DATABASE } from '../infra/database.module.js';

/**
 * Дедуплікація вхідних оновлень Telegram за update_id (ТЗ 12.2, ADR-3, рівень 1).
 * Повторна доставка того самого update_id не потрапляє в обробники.
 */
@Injectable()
export class UpdateDedup {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** true, якщо це перша поява update_id і його можна обробляти. */
  async claim(updateId: number): Promise<boolean> {
    const rows = await this.db
      .insert(processedTelegramUpdates)
      .values({ updateId, result: { status: 'PROCESSING' } })
      .onConflictDoNothing()
      .returning({ updateId: processedTelegramUpdates.updateId });
    return rows.length > 0;
  }
  /** At-most-once admission with visible outcomes; this is not automatic replay or a payload inbox. */
  async run(updateId: number, handle: () => Promise<void>): Promise<'DUPLICATE' | 'COMPLETED'> {
    if (!(await this.claim(updateId))) return 'DUPLICATE';
    try {
      await handle();
    } catch (error) {
      await this.db
        .update(processedTelegramUpdates)
        .set({ result: { status: 'FAILED', code: 'HANDLER_FAILED' } })
        .where(eq(processedTelegramUpdates.updateId, updateId));
      throw error;
    }
    // A failure here leaves PROCESSING: effects may have completed, so replay would be unsafe.
    await this.db
      .update(processedTelegramUpdates)
      .set({ result: { status: 'COMPLETED' } })
      .where(eq(processedTelegramUpdates.updateId, updateId));
    return 'COMPLETED';
  }
}
