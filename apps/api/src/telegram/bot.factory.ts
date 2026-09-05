import { Bot } from 'grammy';
import type { Logger } from 'pino';
import {
  codeFromDeepLink,
  employeeAccess,
  isActivationDeepLink,
  isValidStartParam,
  normalizeActivationCode,
} from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import type { ActivationService } from '../identity/activation.service.js';
import type { EmployeesService } from '../identity/employees.service.js';
import type { BotContext } from './bot-context.js';
import {
  CALLBACK,
  accessDeniedScreen,
  activationFailureText,
  activationOutcomeScreen,
  activationPreviewScreen,
  homeScreen,
  welcomeScreen,
  type Screen,
} from './screens.js';

export interface BotDeps {
  readonly employees: EmployeesService;
  readonly activation: ActivationService;
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

  async function showHome(ctx: BotContext): Promise<void> {
    switch (ctx.access) {
      case 'ALLOWED':
        return show(ctx, ctx.employee ? homeScreen(ctx.employee) : welcomeScreen());
      case 'NOT_REGISTERED':
        return show(ctx, welcomeScreen());
      default:
        return show(ctx, accessDeniedScreen(ctx.access));
    }
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
    await showHome(ctx);
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

  bot.on('message:text', async (ctx) => {
    if (ctx.access === 'NOT_REGISTERED') {
      const code = normalizeActivationCode(ctx.message.text);
      if (code) return startActivation(ctx, code);
      return show(ctx, { text: t.bot.askCode });
    }
    await showHome(ctx);
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
