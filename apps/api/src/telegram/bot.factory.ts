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
import type { AttendanceService } from '../attendance/attendance.service.js';
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
  checkInPromptScreen,
  checkInResultScreen,
  homeScreen,
  planScreen,
  welcomeScreen,
  type Screen,
} from './screens.js';
import type { UpdateDedup } from './update-dedup.js';

export interface BotDeps {
  readonly employees: EmployeesService;
  readonly activation: ActivationService;
  readonly schedule: ScheduleService;
  readonly attendance: AttendanceService;
  readonly dedup: UpdateDedup;
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

  // ADR-3, рівень 1: повторна доставка update_id (webhook або polling) не доходить до обробників.
  bot.use(async (ctx, next) => {
    if (!(await deps.dedup.claim(ctx.update.update_id))) {
      deps.logger.debug({ updateId: ctx.update.update_id }, 'повторне оновлення, пропущено');
      return;
    }
    await next();
  });

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
    const [next, unacknowledged, presence] = await Promise.all([
      deps.schedule.nextShift(ctx.employee.id),
      deps.schedule.unacknowledgedVersions(ctx.employee.id),
      deps.attendance.openPresence(ctx.employee.id),
    ]);
    return homeScreen({
      employee: ctx.employee,
      next,
      unacknowledged: unacknowledged.length,
      presenceSince: presence?.arrivedAt ?? null,
      timezone: next?.timezone ?? deps.defaultTimezone,
    });
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

  /** Deep link з терміналу (FR-QR-02): показати одну доречну дію (FR-UI-01). */
  async function startCheckIn(ctx: BotContext, qrToken: string): Promise<void> {
    if (ctx.access === 'BLOCKED' || ctx.access === 'TERMINATED') {
      return show(ctx, accessDeniedScreen(ctx.access));
    }
    if (ctx.access === 'NOT_REGISTERED' || !ctx.employee) {
      return show(ctx, { text: `${t.attendance.activateFirst}\n\n${t.bot.askCode}` });
    }

    const preview = await deps.attendance.previewChallenge(qrToken);
    if (!preview.ok) return show(ctx, { text: t.attendance.failures[preview.reason] });
    const action = await deps.attendance.intent(ctx.employee.id);
    await show(
      ctx,
      checkInPromptScreen({ action, terminalName: preview.terminal.name, token: qrToken }),
    );
  }

  bot.command('start', async (ctx) => {
    const param = ctx.match.trim();
    if (isActivationDeepLink(param)) return startActivation(ctx, codeFromDeepLink(param) ?? '');
    if (param && isValidStartParam(param)) return startCheckIn(ctx, param);
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

  // «Я на роботі» / «Я пішов» (FR-TIME-01, FR-TIME-05): результат із серверним часом (FR-UI-02).
  bot.callbackQuery(/^(arr|dep):([A-Za-z0-9_-]{22})$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) {
      await ctx.answerCallbackQuery({ text: t.bot.access.NOT_REGISTERED, show_alert: true });
      return;
    }
    const action = ctx.match[1] === 'arr' ? 'ARRIVE' : 'DEPART';
    const result = await deps.attendance.checkInByQr(ctx.employee.id, ctx.match[2] ?? '', action);
    await ctx.answerCallbackQuery();
    await edit(ctx, checkInResultScreen(result, deps.defaultTimezone));
    if (result.ok) await show(ctx, await buildHome(ctx));
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
