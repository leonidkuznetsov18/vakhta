import { timingSafeEqual } from 'node:crypto';
import { Injectable, ServiceUnavailableException, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import type { Env } from '../config/env.js';
import { createLogger } from '../logger.js';
import { createBot } from './bot.factory.js';

/**
 * Тримає єдиний екземпляр grammY-бота і перевіряє секрет webhook (ТЗ 12.2).
 * Без токена API стартує з вимкненим ботом, щоб панель і health працювали.
 */
@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Bot | null = null;
  private readonly logger;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.logger = createLogger({
      LOG_LEVEL: this.config.get('LOG_LEVEL', { infer: true }),
      NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
    });
  }

  async onModuleInit(): Promise<void> {
    const token = this.config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN не задано: бот вимкнений');
      return;
    }
    const bot = createBot(token, this.logger);
    await bot.init();
    this.bot = bot;
    this.logger.info({ username: bot.botInfo.username }, 'telegram-бот ініціалізовано');
  }

  get enabled(): boolean {
    return this.bot !== null;
  }

  verifySecret(header: string | undefined): boolean {
    const expected = this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true });
    if (!expected || !header) return false;
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(header, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async handleUpdate(update: Update): Promise<void> {
    if (!this.bot) throw new ServiceUnavailableException('Бот вимкнений');
    try {
      await this.bot.handleUpdate(update);
    } catch (error) {
      // Помилка обробника не має змушувати Telegram повторювати доставку: update_id уже
      // дедуплікується, а повтор лише подвоїть навантаження (ТЗ 12.2).
      this.logger.error({ err: error, updateId: update.update_id }, 'помилка обробки оновлення');
    }
  }
}
