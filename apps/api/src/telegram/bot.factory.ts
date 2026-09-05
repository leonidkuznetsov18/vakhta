import { Bot } from 'grammy';
import type { Logger } from 'pino';
import {
  businessDateOf,
  codeFromDeepLink,
  employeeAccess,
  isActivationDeepLink,
  isMonth,
  isValidStartParam,
  normalizeActivationCode,
} from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import type { ActivationService } from '../identity/activation.service.js';
import type { EmployeesService } from '../identity/employees.service.js';
import type { ScheduleService } from '../scheduling/schedule.service.js';
import type { BotContext } from './bot-context.js';
import {
  CALLBACK,
  accessDeniedScreen,
  activationFailureText,
  activationOutcomeScreen,
  activationPreviewScreen,
  homeScreen,
  planScreen,
  welcomeScreen,
  type Screen,
} from './screens.js';

export interface BotDeps {
  readonly employees: EmployeesService;
  readonly activation: ActivationService;
  readonly schedule: ScheduleService;
  readonly defaultTimezone: string;
  readonly logger: Logger;
}

/**
 * Збирає grammY-бота. Стан не зберігається в памʼяті процесу (ADR-11): кожне оновлення
 * заново визначає працівника за Telegram user_id, а очікування підтвердження живе в Redis.
 */
export function createBot(token: string, deps: BotDeps): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);
  const t = messages('ru');

  // FR-AUTH-01: хто пише і чи має доступ. Лише активна привʼязка дає employee.
  bot.use(async (ctx, next) => {
    const from = ctx.from;
    const linked = from ? await deps.employees.findByTelegramUserId(from.id) : null;
    ctx.employee = linked?.employee ?? null;
    ctx.access = employeeAccess(linked?.employee.status ?? null);
    await next();
  });

  async function show(ctx: BotContext, screen: Screen): Promise<void> {
    await ctx.reply(screen.text, screen.keyboard ? { reply_markup: screen.keyboard } : undefined);
  }

  async function edit(ctx: BotContext, screen: Screen): Promise<void> {
    try {
      await ctx.editMessageText(
        screen.text,
        screen.keyboard ? { reply_markup: screen.keyboard } : undefined,
      );
    } catch {
      // Той самий текст або застаріле повідомлення: показуємо новим.
      await show(ctx, screen);
    }
  }

  async function buildHome(ctx: BotContext): Promise<Screen> {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) {
      return ctx.access === 'NOT_REGISTERED' || ctx.access === 'ALLOWED'
        ? welcomeScreen()
        : accessDeniedScreen(ctx.access);
    }
    const [next, unacknowledged] = await Promise.all([
      deps.schedule.nextShift(ctx.employee.id),
      deps.schedule.unacknowledgedVersions(ctx.employee.id),
    ]);
    return homeScreen({ employee: ctx.employee, next, unacknowledged: unacknowledged.length });
  }

  async function buildPlan(ctx: BotContext, month: string): Promise<Screen | null> {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) return null;
    const resolved =
      month === 'cur' ? businessDateOf(new Date(), deps.defaultTimezone).slice(0, 7) : month;
    if (!isMonth(resolved)) return null;
    return planScreen(await deps.schedule.myPlan(ctx.employee.id, resolved));
  }

  async function startActivation(ctx: BotContext, rawCode: string): Promise<void> {
    if (!ctx.from) return;
    if (ctx.access === 'ALLOWED') return show(ctx, { text: t.bot.alreadyRegistered });
    if (ctx.access !== 'NOT_REGISTERED') return show(ctx, accessDeniedScreen(ctx.access));

    const preview = await deps.activation.preview(ctx.from.id, rawCode);
    if (!preview.ok) return show(ctx, { text: activationFailureText(preview.reason) });
    await show(ctx, activationPreviewScreen(preview));
  }

  bot.command('start', async (ctx) => {
    const param = ctx.match.trim();
    if (isActivationDeepLink(param)) return startActivation(ctx, codeFromDeepLink(param) ?? '');
    if (param && isValidStartParam(param)) {
      // Deep link з терміналу (FR-QR-02). Обробка challenge зʼявиться у фазі 2.
      return show(ctx, { text: t.bot.qrReceivedNotReady });
    }
    await show(ctx, await buildHome(ctx));
  });

  bot.command('plan', async (ctx) => {
    const screen = await buildPlan(ctx, 'cur');
    await show(ctx, screen ?? (await buildHome(ctx)));
  });

  bot.callbackQuery(CALLBACK.activationConfirm, async (ctx) => {
    const outcome = await deps.activation.confirm(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(activationOutcomeScreen(outcome).text);
  });

  bot.callbackQuery(CALLBACK.activationCancel, async (ctx) => {
    await deps.activation.cancel(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t.activation.cancelled);
  });

  bot.callbackQuery(/^plan:(cur|\d{4}-\d{2})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const screen = await buildPlan(ctx, ctx.match[1] ?? 'cur');
    if (screen) await edit(ctx, screen);
  });

  // «Ознайомлений» з нотифікації (ack:<versionId>) або з головного екрана (ack:all).
  bot.callbackQuery(/^ack:(all|[0-9a-f-]{36})$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) {
      await ctx.answerCallbackQuery({ text: t.bot.access.NOT_REGISTERED, show_alert: true });
      return;
    }
    const target = ctx.match[1] ?? 'all';
    const versions =
      target === 'all'
        ? (await deps.schedule.unacknowledgedVersions(ctx.employee.id)).map((v) => v.versionId)
        : [target];
    let acknowledged = 0;
    for (const versionId of versions) {
      try {
        acknowledged += (await deps.schedule.acknowledge(versionId, ctx.employee.id, 'TELEGRAM'))
          .acknowledged;
      } catch (error) {
        deps.logger.warn({ err: error, versionId }, 'ознайомлення відхилено');
      }
    }
    await ctx.answerCallbackQuery({
      text: acknowledged > 0 ? t.schedule.ackDone : t.schedule.ackNothing,
    });
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    await show(ctx, await buildHome(ctx));
  });

  bot.on('message:text', async (ctx) => {
    if (ctx.access === 'NOT_REGISTERED') {
      const code = normalizeActivationCode(ctx.message.text);
      if (code) return startActivation(ctx, code);
      return show(ctx, { text: t.bot.askCode });
    }
    await show(ctx, await buildHome(ctx));
  });

  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery({ text: t.bot.notReady });
  });

  bot.on('message', async (ctx) => {
    await show(ctx, { text: t.bot.useButtons });
  });

  bot.catch((err) => {
    deps.logger.error(
      { err: err.error, updateId: err.ctx.update.update_id },
      'помилка в обробнику бота',
    );
  });

  return bot;
}
