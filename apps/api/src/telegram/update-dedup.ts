import { Inject, Injectable } from '@nestjs/common';
import { processedTelegramUpdates, type Database } from '@vakhta/db';
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
      .values({ updateId })
      .onConflictDoNothing()
      .returning({ updateId: processedTelegramUpdates.updateId });
    return rows.length > 0;
  }
}
