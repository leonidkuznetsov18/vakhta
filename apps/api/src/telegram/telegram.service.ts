import { timingSafeEqual } from 'node:crypto';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_LOCALE, LOCALES, TenancyMode } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import type { TenantRuntimeConfig } from '@vakhta/registry';
import type { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import type { Subscription } from 'rxjs';
import { AttendanceService } from '../attendance/attendance.service.js';
import { telegramMode, type Env } from '../config/env.js';
import { ActivationService } from '../identity/activation.service.js';
import { EmployeesService } from '../identity/employees.service.js';
import { createLogger } from '../logger.js';
import { ScheduleService } from '../scheduling/schedule.service.js';
import { OpenSlotsService } from '../scheduling/open-slots.service.js';
import { FeedService } from '../scheduling/feed.service.js';
import { HandoverService } from '../handover/handover.service.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import { BonusService } from '../bonus/bonus.service.js';
import { RequestsService } from '../requests/requests.service.js';
import { SHORT_TERM_STORE, type ShortTermStore } from '../infra/short-term-store.js';
import { currentSettings } from '../infra/tenant-context.js';
import { TenantRuntimeRegistry } from '../infra/tenant-runtime.js';
import { ShiftChanges } from '../shift/shift-changes.js';
import { ShiftService } from '../shift/shift.service.js';
import type { BotContext } from './bot-context.js';
import { createBot, renderHomeScreen, type HomeScreenDeps } from './bot.factory.js';
import { HomeScreenPusher } from './home-pusher.js';
import { UpdateDedup } from './update-dedup.js';

interface BotEntry {
  readonly tenantId: string;
  readonly slug: string;
  readonly bot: Bot<BotContext>;
  readonly token: string;
  readonly secret: string | null;
  polling: boolean;
}

/**
 * One grammY bot per tenant that has a token (spec AC-008). In webhook mode the request's host
 * already bound the tenant; in polling mode every handler runs inside the owning tenant's
 * context. Deduplication of update_id is the first middleware of every bot, so it works in both.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnApplicationShutdown {
  private readonly bots = new Map<string, BotEntry>();
  private homeDeps: HomeScreenDeps | null = null;
  private pusher: HomeScreenPusher | null = null;
  private changesSubscription: Subscription | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private syncing: Promise<void> | null = null;
  private readonly logger;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly employees: EmployeesService,
    private readonly activation: ActivationService,
    private readonly schedule: ScheduleService,
    private readonly slots: OpenSlotsService,
    private readonly feed: FeedService,
    private readonly attendance: AttendanceService,
    private readonly shift: ShiftService,
    private readonly incidents: IncidentsService,
    private readonly handover: HandoverService,
    private readonly requests: RequestsService,
    private readonly bonus: BonusService,
    @Inject(SHORT_TERM_STORE) private readonly store: ShortTermStore,
    private readonly dedup: UpdateDedup,
    private readonly changes: ShiftChanges,
    private readonly tenants: TenantRuntimeRegistry,
  ) {
    this.logger = createLogger({
      LOG_LEVEL: this.config.get('LOG_LEVEL', { infer: true }),
      NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
    });
  }

  async onModuleInit(): Promise<void> {
    this.homeDeps = {
      schedule: this.schedule,
      feed: this.feed,
      feedBaseUrl: this.config.get('PUBLIC_BASE_URL', { infer: true }),
      attendance: this.attendance,
      shift: this.shift,
      handover: this.handover,
      requests: this.requests,
      defaultTimezone: this.config.get('DEFAULT_SITE_TIMEZONE', { infer: true }),
      helpUrl: this.config.get('USER_GUIDE_URL', { infer: true }) ?? null,
      supportUrl: this.supportUrl(),
    };
    // A shift changed by a master, a terminal or a timer: the employee gets the new screen at once.
    this.pusher = new HomeScreenPusher(
      (target) => this.pushHomeScreen(target.tenantId, target.employeeId),
      this.logger,
    );
    this.changesSubscription = this.changes.streamAll().subscribe((change) => {
      this.pusher?.onChange(change);
    });
    await this.syncBots();
    if (this.bots.size === 0) this.logger.warn('no tenant has a bot token: worker bots disabled');
    if (this.config.get('TENANCY_MODE', { infer: true }) === TenancyMode.REGISTRY) {
      const everyMs = this.config.get('REGISTRY_REFRESH_SECONDS', { infer: true }) * 1000;
      this.syncTimer = setInterval(() => void this.syncBots(), everyMs);
      this.syncTimer.unref();
    }
  }

  /** Starts bots for tenants that gained a token; stops those that lost it or stopped serving. */
  private syncBots(): Promise<void> {
    if (this.syncing) return this.syncing;
    this.syncing = this.reconcile().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async reconcile(): Promise<void> {
    const wanted = new Map<string, TenantRuntimeConfig>();
    for (const tenant of this.tenants.source.active()) {
      if (tenant.botToken) wanted.set(tenant.id, tenant);
    }
    const stale = [...this.bots.values()].filter(
      (entry) => wanted.get(entry.tenantId)?.botToken !== entry.token,
    );
    await Promise.all(stale.map((entry) => this.stopBot(entry)));
    for (const entry of stale) this.bots.delete(entry.tenantId);
    const missing = [...wanted.values()].filter((tenant) => !this.bots.has(tenant.id));
    await Promise.all(missing.map((tenant) => this.startBotSafely(tenant)));
  }

  private async startBotSafely(tenant: TenantRuntimeConfig): Promise<void> {
    try {
      this.bots.set(tenant.id, await this.startBot(tenant));
    } catch (error) {
      this.logger.error({ err: error, tenant: tenant.slug }, 'telegram-бот: не вдалося запустити');
    }
  }

  private async startBot(tenant: TenantRuntimeConfig): Promise<BotEntry> {
    const token = tenant.botToken;
    if (!token) throw new Error('tenant has no bot token');
    const bot = createBot(token, {
      employees: this.employees,
      activation: this.activation,
      schedule: this.schedule,
      slots: this.slots,
      feed: this.feed,
      feedBaseUrl: this.config.get('PUBLIC_BASE_URL', { infer: true }),
      attendance: this.attendance,
      shift: this.shift,
      incidents: this.incidents,
      handover: this.handover,
      requests: this.requests,
      bonus: this.bonus,
      // Read at use time inside the tenant context, so a settings change applies without a restart.
      get appealWindowDays() {
        return currentSettings().appealWindowDays;
      },
      store: this.store,
      dedup: this.dedup,
      defaultTimezone: tenant.timezone,
      helpUrl: this.config.get('USER_GUIDE_URL', { infer: true }) ?? null,
      supportUrl: this.supportUrl(),
      logger: this.logger,
      runInContext: (fn) => this.inTenant(tenant.id, fn),
    });
    await bot.init();
    await this.registerCommands(bot);
    if (tenant.botUsername && bot.botInfo.username !== tenant.botUsername) {
      this.logger.warn(
        { actual: bot.botInfo.username, configured: tenant.botUsername, tenant: tenant.slug },
        'bot username does not match the tenant configuration: kiosk deep links open another bot',
      );
    }
    const entry: BotEntry = {
      tenantId: tenant.id,
      slug: tenant.slug,
      bot,
      token,
      secret: tenant.webhookSecret,
      polling: false,
    };
    const mode = telegramMode({
      TELEGRAM_MODE: this.config.get('TELEGRAM_MODE', { infer: true }),
      NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
    });
    if (mode === 'polling') {
      entry.polling = true;
      // bot.start() сам знімає webhook і тримає long polling, доки не викликано stop().
      void bot
        .start({
          onStart: (info) =>
            this.logger.info(
              { username: info.username, tenant: tenant.slug },
              'telegram-бот: long polling запущено',
            ),
        })
        .catch((error: unknown) => {
          entry.polling = false;
          this.logger.error({ err: error, tenant: tenant.slug }, 'telegram-бот: polling зупинився');
        });
    } else {
      this.logger.info(
        { username: bot.botInfo.username, tenant: tenant.slug },
        'telegram-бот: режим webhook',
      );
    }
    return entry;
  }

  private async stopBot(entry: BotEntry): Promise<void> {
    if (!entry.polling) return;
    await entry.bot.stop();
    entry.polling = false;
  }

  private inTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    const runtime = this.tenants.byId(tenantId);
    if (!runtime) throw new ServiceUnavailableException('Tenant is not served');
    return this.tenants.enter(runtime, fn);
  }

  /** Deep link to the support assistant, when a bot is configured for it. */
  private supportUrl(): string | null {
    const username = this.config.get('SUPPORT_BOT_USERNAME', { infer: true });
    return username ? `https://t.me/${username.replace(/^@/, '')}?start=worker` : null;
  }

  /** The command menu of the bot in every interface language (base language as the default). */
  private async registerCommands(bot: Bot<BotContext>): Promise<void> {
    const keys = ['start', 'plan', 'scores', 'requests', 'language', 'help'] as const;
    try {
      const menus = LOCALES.map((locale) => ({
        locale,
        commands: keys.map((command) => ({
          command,
          description: messages(locale).bot.commands[command],
        })),
      }));
      const base = menus.find((menu) => menu.locale === DEFAULT_LOCALE);
      if (base) await bot.api.setMyCommands(base.commands);
      await Promise.all(
        menus.map((menu) => bot.api.setMyCommands(menu.commands, { language_code: menu.locale })),
      );
    } catch (error) {
      this.logger.warn({ err: error }, 'telegram-бот: не вдалося оновити меню команд');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
    this.changesSubscription?.unsubscribe();
    this.pusher?.stop();
    await Promise.all([...this.bots.values()].map((entry) => this.stopBot(entry)));
  }

  /**
   * Sends the current home screen to the employee's chat as a new message. Nothing is sent to
   * employees without an active Telegram link or without access.
   */
  async pushHomeScreen(tenantId: string, employeeId: string): Promise<void> {
    const entry = this.bots.get(tenantId);
    const deps = this.homeDeps;
    if (!entry || !deps) return;
    await this.inTenant(tenantId, async () => {
      const [employee, link] = await Promise.all([
        this.employees.getById(employeeId),
        this.employees.activeLinkByEmployee(employeeId),
      ]);
      if (!employee || !link || employee.status !== 'ACTIVE') return;
      const t = messages(employee.locale ?? DEFAULT_LOCALE);
      const screen = await renderHomeScreen(deps, t, employee);
      await entry.bot.api.sendMessage(
        link.telegramUserId,
        screen.text,
        screen.keyboard ? { reply_markup: screen.keyboard } : undefined,
      );
    });
  }

  get enabled(): boolean {
    return this.bots.size > 0;
  }

  isEnabledFor(tenantId: string): boolean {
    return this.bots.has(tenantId);
  }

  verifySecret(tenantId: string, header: string | undefined): boolean {
    const expected = this.bots.get(tenantId)?.secret;
    if (!expected || !header) return false;
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(header, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Вхід із webhook; у режимі polling оновлення сюди не приходять. */
  async handleUpdate(tenantId: string, update: Update): Promise<void> {
    const entry = this.bots.get(tenantId);
    if (!entry) throw new ServiceUnavailableException('Бот вимкнений');
    try {
      await this.inTenant(tenantId, () => entry.bot.handleUpdate(update));
    } catch (error) {
      // Помилка обробника не має змушувати Telegram повторювати доставку: update_id уже
      // дедуплікується, а повтор лише подвоїть навантаження (ТЗ 12.2).
      this.logger.error({ err: error, updateId: update.update_id }, 'помилка обробки оновлення');
    }
  }
}
