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
import { SHIFT_ACTIONS, type ShiftAction } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { employeeActor } from '../common/actor.js';
import type { AttendanceService } from '../attendance/attendance.service.js';
import type { ActivationService } from '../identity/activation.service.js';
import type { EmployeesService } from '../identity/employees.service.js';
import type { ScheduleService } from '../scheduling/schedule.service.js';
import type { ShiftService } from '../shift/shift.service.js';
import type { IncidentsService } from '../incidents/incidents.service.js';
import type { ShortTermStore } from '../infra/short-term-store.js';
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
  incidentCommentScreen,
  incidentPhotoScreen,
  incidentReasonScreen,
  incidentResultScreen,
  incidentStoppedScreen,
  planScreen,
  reasonPickerScreen,
  shiftScreen,
  welcomeScreen,
  type Screen,
} from './screens.js';
import type { UpdateDedup } from './update-dedup.js';

/** Незавершене повідомлення про проблему живе в Redis, не в памʼяті процесу (ADR-11). */
interface PendingReport {
  readonly reasonCode: string;
  readonly reasonLabel: string;
  readonly step: 'comment' | 'photo' | 'stop';
  readonly comment?: string;
  readonly photoFileId?: string;
  readonly requiresPhoto: boolean;
}
const PENDING_TTL_SECONDS = 600;

function isShiftAction(value: string): value is ShiftAction {
  return (SHIFT_ACTIONS as readonly string[]).includes(value);
}

export interface BotDeps {
  readonly employees: EmployeesService;
  readonly activation: ActivationService;
  readonly schedule: ScheduleService;
  readonly attendance: AttendanceService;
  readonly shift: ShiftService;
  readonly incidents: IncidentsService;
  readonly store: ShortTermStore;
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
    const [next, unacknowledged, presence, shift] = await Promise.all([
      deps.schedule.nextShift(ctx.employee.id),
      deps.schedule.unacknowledgedVersions(ctx.employee.id),
      deps.attendance.openPresence(ctx.employee.id),
      deps.shift.screen(ctx.employee.id),
    ]);
    const timezone = next?.timezone ?? deps.defaultTimezone;
    const home = homeScreen({
      employee: ctx.employee,
      next,
      unacknowledged: unacknowledged.length,
      presenceSince: presence?.arrivedAt ?? null,
      timezone,
    });
    // ТЗ 5.1: у зміні і одразу після неї головний екран є екраном зміни.
    if (shift.session || shift.allowedActions.includes('START_SHIFT')) {
      return shiftScreen({ ...shift, timezone }, home.text);
    }
    return home;
  }

  /** Спільний хвіст для всіх кнопок зміни: тост із результатом і перемальований екран. */
  async function finishShiftCommand(
    ctx: BotContext,
    result: Awaited<ReturnType<ShiftService['transition']>>,
  ): Promise<void> {
    if (!result.ok) {
      await ctx.answerCallbackQuery({
        text: result.error === 'VERSION_CONFLICT' ? t.shift.staleButton : t.errors[result.error],
        show_alert: result.error !== 'VERSION_CONFLICT',
      });
    } else {
      await ctx.answerCallbackQuery();
    }
    await edit(ctx, await buildHome(ctx));
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

  // Кнопки зміни (ТЗ 4.4): версія в callback data захищає від застарілих кнопок (ТЗ 12.3).
  bot.callbackQuery(/^sh:pick:(DOWNTIME|EMERGENCY):(\d+)$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const view = await deps.shift.screen(ctx.employee.id);
    if (!view.session || String(view.session.version) !== ctx.match[2]) {
      return edit(ctx, await buildHome(ctx));
    }
    await edit(
      ctx,
      reasonPickerScreen(view, ctx.match[1] === 'DOWNTIME' ? 'DOWNTIME' : 'EMERGENCY'),
    );
  });

  bot.callbackQuery(/^sh:back$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await edit(ctx, await buildHome(ctx));
  });

  bot.callbackQuery(/^sh:zone:(\d+)$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) return ctx.answerCallbackQuery();
    try {
      await deps.shift.acceptZone(ctx.employee.id, employeeActor(ctx.employee.id));
      await ctx.answerCallbackQuery({ text: t.shift.zoneAccepted });
    } catch (error) {
      deps.logger.warn({ err: error }, 'зону не прийнято');
      await ctx.answerCallbackQuery({ text: t.errors.NO_ACTIVE_SHIFT });
    }
    await edit(ctx, await buildHome(ctx));
  });

  // «Сообщить о проблеме» (ТЗ 5.5): причина → коментар/фото за потреби → «Работа остановлена?»
  const pendingKey = (telegramUserId: number) => `incident:pending:${telegramUserId}`;
  async function readPending(ctx: BotContext): Promise<PendingReport | null> {
    if (!ctx.from) return null;
    const raw = await deps.store.get(pendingKey(ctx.from.id));
    return raw ? (JSON.parse(raw) as PendingReport) : null;
  }
  async function writePending(ctx: BotContext, pending: PendingReport): Promise<void> {
    if (!ctx.from) return;
    await deps.store.set(pendingKey(ctx.from.id), JSON.stringify(pending), PENDING_TTL_SECONDS);
  }
  async function clearPending(ctx: BotContext): Promise<void> {
    if (ctx.from) await deps.store.del(pendingKey(ctx.from.id));
  }
  async function nextStep(ctx: BotContext, pending: PendingReport): Promise<void> {
    await writePending(ctx, pending);
    if (pending.step === 'comment') return show(ctx, incidentCommentScreen());
    if (pending.step === 'photo') return show(ctx, incidentPhotoScreen());
    return show(ctx, incidentStoppedScreen(pending.reasonLabel));
  }

  bot.callbackQuery(/^inc:new:(\d+)$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const view = await deps.shift.screen(ctx.employee.id);
    if (!view.session || view.session.endedAt) return edit(ctx, { text: t.incidents.noShift });
    await edit(ctx, incidentReasonScreen(view.downtimeReasons));
  });

  bot.callbackQuery(/^inc:r:([A-Z][A-Z0-9_]{1,63})$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) return ctx.answerCallbackQuery();
    const reason = await deps.incidents.reason(ctx.match[1] ?? '');
    await ctx.answerCallbackQuery();
    if (!reason) return edit(ctx, { text: t.shift.noReasons });
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    await nextStep(ctx, {
      reasonCode: reason.code,
      reasonLabel: reason.label,
      requiresPhoto: reason.requiresPhoto,
      step: reason.requiresComment ? 'comment' : reason.requiresPhoto ? 'photo' : 'stop',
    });
  });

  bot.callbackQuery(/^inc:skip$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const pending = await readPending(ctx);
    if (!pending) return edit(ctx, { text: t.incidents.expired });
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    await nextStep(ctx, { ...pending, step: 'stop' });
  });

  bot.callbackQuery(/^inc:cancel$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearPending(ctx);
    await edit(ctx, { text: t.incidents.cancelled });
    await show(ctx, await buildHome(ctx));
  });

  bot.callbackQuery(/^inc:stop:(1|0)$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) return ctx.answerCallbackQuery();
    const pending = await readPending(ctx);
    if (!pending) {
      await ctx.answerCallbackQuery();
      return edit(ctx, { text: t.incidents.expired });
    }
    try {
      const result = await deps.incidents.report(
        ctx.employee.id,
        {
          reasonCode: pending.reasonCode,
          stoppedWork: ctx.match[1] === '1',
          idempotencyKey: `tg:${ctx.update.update_id}`,
          ...(pending.comment ? { comment: pending.comment } : {}),
          ...(pending.photoFileId ? { photoFileId: pending.photoFileId } : {}),
        },
        employeeActor(ctx.employee.id),
      );
      await clearPending(ctx);
      await ctx.answerCallbackQuery();
      await edit(ctx, incidentResultScreen(result, pending.reasonLabel));
    } catch (error) {
      deps.logger.warn({ err: error }, 'повідомлення про проблему відхилено');
      await clearPending(ctx);
      await ctx.answerCallbackQuery({ text: t.incidents.noShift, show_alert: true });
    }
    await show(ctx, await buildHome(ctx));
  });

  bot.callbackQuery(/^sh:([A-Z_]+):(\d+)(?::([A-Z][A-Z0-9_]{1,63}))?$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) {
      await ctx.answerCallbackQuery({ text: t.bot.access.NOT_REGISTERED, show_alert: true });
      return;
    }
    const action = ctx.match[1] ?? '';
    if (!isShiftAction(action)) return ctx.answerCallbackQuery({ text: t.bot.notReady });
    const version = Number(ctx.match[2]);
    const extra = ctx.match[3];
    const meta = { actor: employeeActor(ctx.employee.id), source: 'TELEGRAM' as const };
    const idempotencyKey = `tg:${ctx.update.update_id}`;
    const result =
      action === 'START_SHIFT'
        ? await deps.shift.start(ctx.employee.id, { idempotencyKey }, meta)
        : await deps.shift.transition(
            ctx.employee.id,
            {
              action,
              expectedVersion: version,
              idempotencyKey,
              ...(extra && extra !== 'DT' ? { reasonCode: extra } : {}),
              ...(extra === 'DT' ? { resumeIntoDowntime: true } : {}),
            },
            meta,
          );
    await finishShiftCommand(ctx, result);
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
    const pending = await readPending(ctx);
    if (pending?.step === 'comment') {
      const comment = ctx.message.text.trim().slice(0, 2000);
      return nextStep(ctx, { ...pending, comment, step: pending.requiresPhoto ? 'photo' : 'stop' });
    }
    await show(ctx, await buildHome(ctx));
  });

  bot.on('message:photo', async (ctx) => {
    const pending = await readPending(ctx);
    if (pending?.step === 'photo') {
      const largest = ctx.message.photo[ctx.message.photo.length - 1];
      return nextStep(ctx, {
        ...pending,
        ...(largest ? { photoFileId: largest.file_id } : {}),
        step: 'stop',
      });
    }
    await show(ctx, { text: t.bot.useButtons });
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
