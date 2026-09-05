import { timingSafeEqual } from 'node:crypto';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import { AttendanceService } from '../attendance/attendance.service.js';
import { telegramMode, type Env } from '../config/env.js';
import { ActivationService } from '../identity/activation.service.js';
import { EmployeesService } from '../identity/employees.service.js';
import { createLogger } from '../logger.js';
import { ScheduleService } from '../scheduling/schedule.service.js';
import { HandoverService } from '../handover/handover.service.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import { RequestsService } from '../requests/requests.service.js';
import { SHORT_TERM_STORE, type ShortTermStore } from '../infra/short-term-store.js';
import { ShiftService } from '../shift/shift.service.js';
import type { BotContext } from './bot-context.js';
import { createBot } from './bot.factory.js';
import { UpdateDedup } from './update-dedup.js';

/**
 * Тримає єдиний екземпляр grammY-бота. У режимі webhook перевіряє секрет (ТЗ 12.2),
 * у режимі polling сам забирає оновлення: для розробки без публічної адреси.
 * Дедуплікація update_id є першим middleware бота, тому діє в обох режимах.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnApplicationShutdown {
  private bot: Bot<BotContext> | null = null;
  private polling = false;
  private readonly logger;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly employees: EmployeesService,
    private readonly activation: ActivationService,
    private readonly schedule: ScheduleService,
    private readonly attendance: AttendanceService,
    private readonly shift: ShiftService,
    private readonly incidents: IncidentsService,
    private readonly handover: HandoverService,
    private readonly requests: RequestsService,
    @Inject(SHORT_TERM_STORE) private readonly store: ShortTermStore,
    private readonly dedup: UpdateDedup,
  ) {
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
    const bot = createBot(token, {
      employees: this.employees,
      activation: this.activation,
      schedule: this.schedule,
      attendance: this.attendance,
      shift: this.shift,
      incidents: this.incidents,
      handover: this.handover,
      requests: this.requests,
      store: this.store,
      dedup: this.dedup,
      defaultTimezone: this.config.get('DEFAULT_SITE_TIMEZONE', { infer: true }),
      logger: this.logger,
    });
    await bot.init();
    this.bot = bot;

    const expectedUsername = this.config.get('TELEGRAM_BOT_USERNAME', { infer: true });
    if (bot.botInfo.username !== expectedUsername) {
      this.logger.warn(
        { actual: bot.botInfo.username, configured: expectedUsername },
        'TELEGRAM_BOT_USERNAME не збігається з ботом: deep links з терміналу відкриють іншого бота',
      );
    }

    const mode = telegramMode({
      TELEGRAM_MODE: this.config.get('TELEGRAM_MODE', { infer: true }),
      NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
    });
    if (mode === 'polling') {
      this.polling = true;
      // bot.start() сам знімає webhook і тримає long polling, доки не викликано stop().
      void bot
        .start({
          onStart: (info) =>
            this.logger.info({ username: info.username }, 'telegram-бот: long polling запущено'),
        })
        .catch((error: unknown) => {
          this.polling = false;
          this.logger.error({ err: error }, 'telegram-бот: polling зупинився з помилкою');
        });
    } else {
      this.logger.info({ username: bot.botInfo.username }, 'telegram-бот: режим webhook');
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
    const expected = this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true });
    if (!expected || !header) return false;
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(header, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Вхід із webhook; у режимі polling оновлення сюди не приходять. */
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
