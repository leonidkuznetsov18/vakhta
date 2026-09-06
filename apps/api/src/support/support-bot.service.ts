import { timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  ServiceUnavailableException,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_LOCALE, LOCALES } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import type { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import { telegramMode, type Env } from '../config/env.js';
import { createLogger } from '../logger.js';
import { createSupportBot } from './support-bot.factory.js';
import { SupportService } from './support.service.js';

/**
 * Holds the support bot next to the worker bot: webhook with its own secret in production,
 * polling in development. Silent when TELEGRAM_SUPPORT_BOT_TOKEN is not set.
 */
@Injectable()
export class SupportBotService implements OnModuleInit, OnApplicationShutdown {
  private bot: Bot | null = null;
  private polling = false;
  private readonly logger;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly support: SupportService,
  ) {
    this.logger = createLogger({
      LOG_LEVEL: this.config.get('LOG_LEVEL', { infer: true }),
      NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
    });
  }

  async onModuleInit(): Promise<void> {
    const token = this.config.get('TELEGRAM_SUPPORT_BOT_TOKEN', { infer: true });
    if (!token) return;
    if (!this.support.enabled) {
      this.logger.warn(
        'support bot: ANTHROPIC_API_KEY is not set, the assistant will say it is unavailable',
      );
    }
    const bot = createSupportBot(token, { support: this.support, logger: this.logger });
    await bot.init();
    this.bot = bot;
    await this.registerCommands(bot);
    const mode = telegramMode({
      TELEGRAM_MODE: this.config.get('TELEGRAM_MODE', { infer: true }),
      NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
    });
    if (mode === 'polling') {
      this.polling = true;
      void bot
        .start({
          onStart: (info) =>
            this.logger.info({ username: info.username }, 'support bot: long polling'),
        })
        .catch((error: unknown) => {
          this.polling = false;
          this.logger.error({ err: error }, 'support bot: polling stopped');
        });
    } else {
      this.logger.info(
        { username: bot.botInfo.username, voice: this.support.voiceEnabled },
        'support bot: webhook mode',
      );
    }
  }

  private async registerCommands(bot: Bot): Promise<void> {
    try {
      for (const locale of LOCALES) {
        const t = messages(locale).support.commands;
        const commands = [
          { command: 'start', description: t.start },
          { command: 'reset', description: t.reset },
        ];
        if (locale === DEFAULT_LOCALE) await bot.api.setMyCommands(commands);
        await bot.api.setMyCommands(commands, { language_code: locale });
      }
    } catch (error) {
      this.logger.warn({ err: error }, 'support bot: could not set the command menu');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.bot && this.polling) {
      await this.bot.stop();
      this.polling = false;
    }
  }

  get enabled(): boolean {
    return this.bot !== null;
  }

  verifySecret(header: string | undefined): boolean {
    const expected = this.config.get('TELEGRAM_SUPPORT_WEBHOOK_SECRET', { infer: true });
    if (!expected || !header) return false;
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(header, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async handleUpdate(update: Update): Promise<void> {
    if (!this.bot) throw new ServiceUnavailableException('Support bot is disabled');
    try {
      await this.bot.handleUpdate(update);
    } catch (error) {
      this.logger.error({ err: error, updateId: update.update_id }, 'support bot: update failed');
    }
  }
}
