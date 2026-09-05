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
import {
  HANDOVER_ANGLES,
  REQUEST_TYPES,
  SHIFT_ACTIONS,
  type HandoverAngle,
  type RequestType,
  type ShiftAction,
} from '@vakhta/domain';
import { format, messages } from '@vakhta/i18n';
import { employeeActor } from '../common/actor.js';
import type { AttendanceService } from '../attendance/attendance.service.js';
import type { ActivationService } from '../identity/activation.service.js';
import type { EmployeesService } from '../identity/employees.service.js';
import type { ScheduleService } from '../scheduling/schedule.service.js';
import type { ShiftService } from '../shift/shift.service.js';
import type { HandoverService } from '../handover/handover.service.js';
import type { IncidentsService } from '../incidents/incidents.service.js';
import type { RequestsService } from '../requests/requests.service.js';
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
  cannotCompleteReasonScreen,
  handoverNeedsScreen,
  handoverPhotoPromptScreen,
  handoverRemarkCategoryScreen,
  handoverSafeScreen,
  handoverScreen,
  handoverTextPromptScreen,
  incidentCommentScreen,
  incidentPhotoScreen,
  incidentReasonScreen,
  incidentResultScreen,
  incidentStoppedScreen,
  counterpartScreen,
  pendingHandoverScreen,
  planScreen,
  requestAssignmentScreen,
  requestChoiceScreen,
  requestListScreen,
  requestMenuScreen,
  requestPromptScreen,
  reasonPickerScreen,
  reviewCategoryScreen,
  shiftScreen,
  welcomeScreen,
  type Screen,
} from './screens.js';
import type { UpdateDedup } from './update-dedup.js';

/** Незавершені кроки передачі й приймання; живуть у Redis поруч із повідомленням про проблему. */
type PendingHandover =
  | { readonly kind: 'photo'; readonly angle: HandoverAngle }
  | { readonly kind: 'note' }
  | {
      readonly kind: 'remark';
      readonly itemKey: string;
      readonly step: 'category' | 'text' | 'safe' | 'needs';
      readonly category?: string;
      readonly text?: string;
      readonly safeToWork?: boolean;
    }
  | {
      readonly kind: 'review';
      readonly handoverId: string;
      readonly step: 'category' | 'comment' | 'photo';
      readonly category?: string;
      readonly comment?: string;
    };

/** Незавершене звернення: тип і зібрані поля (ТЗ 8.1). */
interface PendingRequest {
  readonly type: RequestType;
  readonly step:
    | 'period'
    | 'shift'
    | 'counterpart'
    | 'counterpartShift'
    | 'date'
    | 'template'
    | 'minutes'
    | 'reason'
    | 'comment'
    | 'medical';
  readonly periodFrom?: string;
  readonly periodTo?: string;
  readonly assignmentId?: string;
  readonly counterpartEmployeeId?: string;
  readonly counterpartAssignmentId?: string;
  readonly businessDate?: string;
  readonly templateId?: string;
  readonly minutes?: number;
  readonly reasonCode?: string;
  readonly shiftSessionId?: string;
  readonly comment?: string;
}

/** «12.10–16.10» або «12.10» → ISO-дати в найближчому майбутньому. */
function parsePeriod(text: string, now: Date): { from: string; to: string } | null {
  const m = text.replace(/\s+/g, '').match(/^(\d{1,2})\.(\d{1,2})(?:[–—-](\d{1,2})\.(\d{1,2}))?$/);
  if (!m) return null;
  const year = now.getUTCFullYear();
  const mk = (d: string, mo: string): string | null => {
    let y = year;
    const probe = new Date(Date.UTC(y, Number(mo) - 1, Number(d)));
    if (probe.getTime() < now.getTime() - 30 * 86_400_000) y += 1;
    const date = new Date(Date.UTC(y, Number(mo) - 1, Number(d)));
    if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== Number(mo) - 1) return null;
    return date.toISOString().slice(0, 10);
  };
  const from = mk(m[1]!, m[2]!);
  const to = m[3] && m[4] ? mk(m[3], m[4]) : from;
  if (!from || !to || from > to) return null;
  return { from, to };
}

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
  readonly handover: HandoverService;
  readonly requests: RequestsService;
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
    const [next, unacknowledged, presence, shiftRaw, pendingHandovers, pendingSwaps] =
      await Promise.all([
        deps.schedule.nextShift(ctx.employee.id),
        deps.schedule.unacknowledgedVersions(ctx.employee.id),
        deps.attendance.openPresence(ctx.employee.id),
        deps.shift.screen(ctx.employee.id),
        deps.handover.pendingForReceiver(ctx.employee.id),
        deps.requests.pendingCounterpart(ctx.employee.id),
      ]);
    const shift = { ...shiftRaw, pendingHandovers: pendingHandovers.length };
    const timezone = next?.timezone ?? deps.defaultTimezone;
    const home = homeScreen({
      employee: ctx.employee,
      next,
      unacknowledged: unacknowledged.length,
      presenceSince: presence?.arrivedAt ?? null,
      timezone,
      pendingSwaps: pendingSwaps.length,
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

  // Прибирання і передача (ТЗ 5.6–5.8): чек-лист, фото, подання; приймання наступною зміною.
  const hvKey = (telegramUserId: number) => `handover:pending:${telegramUserId}`;
  async function readHv(ctx: BotContext): Promise<PendingHandover | null> {
    if (!ctx.from) return null;
    const raw = await deps.store.get(hvKey(ctx.from.id));
    return raw ? (JSON.parse(raw) as PendingHandover) : null;
  }
  async function writeHv(ctx: BotContext, pending: PendingHandover): Promise<void> {
    if (ctx.from)
      await deps.store.set(hvKey(ctx.from.id), JSON.stringify(pending), PENDING_TTL_SECONDS);
  }
  async function clearHv(ctx: BotContext): Promise<void> {
    if (ctx.from) await deps.store.del(hvKey(ctx.from.id));
  }
  async function showHandover(ctx: BotContext): Promise<void> {
    if (!ctx.employee) return;
    const view = await deps.handover.current(ctx.employee.id);
    if (!view) return edit(ctx, await buildHome(ctx));
    await edit(ctx, handoverScreen(view, ''));
  }
  async function handoverReasons(): Promise<{ code: string; label: string }[]> {
    return deps.incidents.reasonOptions('HANDOVER');
  }
  function guardEmployee(
    ctx: BotContext,
  ): ctx is BotContext & { employee: NonNullable<BotContext['employee']> } {
    return ctx.access === 'ALLOWED' && ctx.employee !== null;
  }

  bot.callbackQuery(/^hv:open$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    await showHandover(ctx);
  });

  bot.callbackQuery(/^hv:ok:([A-Z_]{2,64})$/, async (ctx) => {
    if (!guardEmployee(ctx)) return ctx.answerCallbackQuery();
    try {
      await deps.handover.answer(
        ctx.employee.id,
        { itemKey: ctx.match[1] ?? '', ok: true },
        employeeActor(ctx.employee.id),
      );
      await ctx.answerCallbackQuery();
    } catch (error) {
      deps.logger.warn({ err: error }, 'відповідь чек-листа відхилено');
      await ctx.answerCallbackQuery({ text: t.errors.ACTION_NOT_ALLOWED, show_alert: true });
    }
    await showHandover(ctx);
  });

  bot.callbackQuery(/^hv:rem:([A-Z_]{2,64})$/, async (ctx) => {
    if (!guardEmployee(ctx)) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const view = await deps.handover.current(ctx.employee.id);
    const item = view?.items.find((i) => i.key === ctx.match[1]);
    if (!view || !item) return showHandover(ctx);
    await writeHv(ctx, { kind: 'remark', itemKey: item.key, step: 'category' });
    await edit(ctx, handoverRemarkCategoryScreen(item.label, await handoverReasons()));
  });

  bot.callbackQuery(/^hv:rc:([A-Z][A-Z0-9_]{1,63})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const pending = await readHv(ctx);
    if (pending?.kind !== 'remark') return showHandover(ctx);
    await writeHv(ctx, { ...pending, category: ctx.match[1] ?? '', step: 'text' });
    await edit(ctx, handoverTextPromptScreen(t.handover.askRemarkText));
  });

  bot.callbackQuery(/^hv:safe:(1|0)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const pending = await readHv(ctx);
    if (pending?.kind !== 'remark') return showHandover(ctx);
    await writeHv(ctx, { ...pending, safeToWork: ctx.match[1] === '1', step: 'needs' });
    await edit(ctx, handoverNeedsScreen());
  });

  bot.callbackQuery(/^hv:need:(MASTER|CLEANING|REPAIR|NONE)$/, async (ctx) => {
    if (!guardEmployee(ctx)) return ctx.answerCallbackQuery();
    const pending = await readHv(ctx);
    if (pending?.kind !== 'remark') {
      await ctx.answerCallbackQuery();
      return showHandover(ctx);
    }
    const need = ctx.match[1];
    try {
      await deps.handover.answer(
        ctx.employee.id,
        {
          itemKey: pending.itemKey,
          ok: false,
          ...(pending.category ? { remarkCategory: pending.category } : {}),
          ...(pending.text ? { remarkText: pending.text } : {}),
          ...(pending.safeToWork !== undefined ? { safeToWork: pending.safeToWork } : {}),
          needs: need && need !== 'NONE' ? [need as 'MASTER' | 'CLEANING' | 'REPAIR'] : [],
        },
        employeeActor(ctx.employee.id),
      );
      await ctx.answerCallbackQuery({ text: t.handover.remarkSaved });
    } catch (error) {
      deps.logger.warn({ err: error }, 'зауваження відхилено');
      await ctx.answerCallbackQuery({ text: t.errors.ACTION_NOT_ALLOWED, show_alert: true });
    }
    await clearHv(ctx);
    await showHandover(ctx);
  });

  bot.callbackQuery(/^hv:note$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    await writeHv(ctx, { kind: 'note' });
    await edit(ctx, handoverTextPromptScreen(t.handover.askNote));
  });

  bot.callbackQuery(/^hv:ph:(OVERVIEW|SURFACES|FLOOR)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    const angle = ctx.match[1] as HandoverAngle;
    if (!HANDOVER_ANGLES.includes(angle)) return;
    await writeHv(ctx, { kind: 'photo', angle });
    await edit(ctx, handoverPhotoPromptScreen(angle));
  });

  bot.callbackQuery(/^hv:cannot$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    await edit(ctx, cannotCompleteReasonScreen(await handoverReasons()));
  });

  bot.callbackQuery(/^hv:cr:([A-Z][A-Z0-9_]{1,63})$/, async (ctx) => {
    if (!guardEmployee(ctx)) return ctx.answerCallbackQuery();
    try {
      await deps.handover.cannotComplete(
        ctx.employee.id,
        { reasonCode: ctx.match[1] ?? '' },
        employeeActor(ctx.employee.id),
      );
      await ctx.answerCallbackQuery({ text: t.handover.cannotCompleteSaved, show_alert: true });
    } catch (error) {
      // «Другое» вимагає коментар: просимо текст, збережемо через pending
      deps.logger.debug({ err: error }, 'причина потребує коментаря');
      await ctx.answerCallbackQuery();
      await writeHv(ctx, {
        kind: 'remark',
        itemKey: `CANNOT:${ctx.match[1]}`,
        step: 'text',
        category: ctx.match[1] ?? '',
      });
      return edit(ctx, handoverTextPromptScreen(t.incidents.askComment));
    }
    await showHandover(ctx);
  });

  bot.callbackQuery(/^hv:submit$/, async (ctx) => {
    if (!guardEmployee(ctx)) return ctx.answerCallbackQuery();
    try {
      const result = await deps.handover.submit(
        ctx.employee.id,
        { idempotencyKey: `tg:${ctx.update.update_id}` },
        employeeActor(ctx.employee.id),
      );
      await ctx.answerCallbackQuery({
        text: result.ok ? t.handover.submitted : t.handover.notReady,
        show_alert: !result.ok,
      });
      if (!result.ok) return edit(ctx, handoverScreen(result.handover, ''));
    } catch (error) {
      deps.logger.warn({ err: error }, 'подання звіту відхилено');
      await ctx.answerCallbackQuery({ text: t.errors.ACTION_NOT_ALLOWED, show_alert: true });
    }
    await edit(ctx, await buildHome(ctx));
  });

  bot.callbackQuery(/^hv:cancel$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearHv(ctx);
    if (!guardEmployee(ctx)) return;
    const view = await deps.handover.current(ctx.employee.id);
    await edit(ctx, view ? handoverScreen(view, '') : await buildHome(ctx));
  });

  // Приймання наступною зміною (FR-HND-03/04).
  bot.callbackQuery(/^hr:open$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    const pending = await deps.handover.pendingForReceiver(ctx.employee.id);
    if (pending.length === 0) return edit(ctx, await buildHome(ctx));
    await edit(ctx, pendingHandoverScreen(pending, deps.defaultTimezone));
  });

  bot.callbackQuery(/^hr:ok:([0-9a-f-]{36})$/, async (ctx) => {
    if (!guardEmployee(ctx)) return ctx.answerCallbackQuery();
    try {
      await deps.handover.review(
        ctx.employee.id,
        ctx.match[1] ?? '',
        { decision: 'ACCEPTED', idempotencyKey: `tg:${ctx.update.update_id}` },
        employeeActor(ctx.employee.id),
      );
      await ctx.answerCallbackQuery({ text: t.handover.reviewAccepted });
    } catch (error) {
      deps.logger.warn({ err: error }, 'приймання відхилено');
      const code = (error as { code?: string }).code;
      await ctx.answerCallbackQuery({
        text: code === 'REVIEW_OWN_HANDOVER' ? t.handover.reviewOwn : t.errors.ACTION_NOT_ALLOWED,
        show_alert: true,
      });
    }
    await edit(ctx, await buildHome(ctx));
  });

  bot.callbackQuery(/^hr:issue:([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    await writeHv(ctx, { kind: 'review', handoverId: ctx.match[1] ?? '', step: 'category' });
    await edit(ctx, reviewCategoryScreen(await handoverReasons()));
  });

  bot.callbackQuery(/^hr:rc:([A-Z][A-Z0-9_]{1,63})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const pending = await readHv(ctx);
    if (pending?.kind !== 'review') return edit(ctx, await buildHome(ctx));
    await writeHv(ctx, { ...pending, category: ctx.match[1] ?? '', step: 'comment' });
    await edit(ctx, handoverTextPromptScreen(t.handover.reviewComment));
  });

  // Звернення (ТЗ 8, FR-SCH-05): тип → поля за типом → коментар → подання.
  const rqKey = (telegramUserId: number) => `request:pending:${telegramUserId}`;
  async function readRq(ctx: BotContext): Promise<PendingRequest | null> {
    if (!ctx.from) return null;
    const raw = await deps.store.get(rqKey(ctx.from.id));
    return raw ? (JSON.parse(raw) as PendingRequest) : null;
  }
  async function writeRq(ctx: BotContext, pending: PendingRequest): Promise<void> {
    if (ctx.from)
      await deps.store.set(rqKey(ctx.from.id), JSON.stringify(pending), PENDING_TTL_SECONDS);
  }
  async function clearRq(ctx: BotContext): Promise<void> {
    if (ctx.from) await deps.store.del(rqKey(ctx.from.id));
  }
  function isRequestType(v: string): v is RequestType {
    return (REQUEST_TYPES as readonly string[]).includes(v);
  }
  async function askRq(
    ctx: BotContext,
    pending: PendingRequest,
    render: (s: Screen) => Promise<void>,
  ): Promise<void> {
    if (!ctx.employee) return;
    await writeRq(ctx, pending);
    switch (pending.step) {
      case 'period':
      case 'date':
        return render(requestPromptScreen(t.requests.askPeriod));
      case 'shift':
        return render(
          requestAssignmentScreen(
            await deps.requests.upcomingAssignments(ctx.employee.id),
            'rq:a:',
            t.requests.chooseShift,
          ),
        );
      case 'counterpart': {
        const candidates = await deps.requests.swapCandidates(
          ctx.employee.id,
          pending.assignmentId ?? '',
        );
        return render(
          requestChoiceScreen(
            candidates.map((c) => ({ id: c.id, label: c.fullName })),
            'rq:c:',
            t.requests.chooseCounterpart,
          ),
        );
      }
      case 'counterpartShift':
        return render(
          requestAssignmentScreen(
            await deps.requests.upcomingAssignments(pending.counterpartEmployeeId ?? ''),
            'rq:ca:',
            t.requests.chooseCounterpartShift,
          ),
        );
      case 'template': {
        const templates = await deps.requests.templatesFor(ctx.employee.id);
        return render(
          requestChoiceScreen(
            templates.map((x) => ({ id: x.id, label: x.name })),
            'rq:tpl:',
            t.requests.chooseTemplate,
          ),
        );
      }
      case 'minutes':
        return render(requestPromptScreen(t.requests.askMinutes));
      case 'reason':
        return render(
          requestChoiceScreen(
            (await deps.incidents.reasonOptions('CORRECTION')).map((r) => ({
              id: r.code,
              label: r.label,
            })),
            'rq:r:',
            t.incidents.chooseReason,
          ),
        );
      case 'comment':
        return render(requestPromptScreen(t.requests.askComment, pending.type === 'SICK'));
      case 'medical':
        return render(requestPromptScreen(t.requests.askMedical, true));
    }
  }
  const STEP_ORDER: Record<RequestType, PendingRequest['step'][]> = {
    VACATION: ['period', 'comment'],
    DAY_OFF: ['period', 'comment'],
    SICK: ['period', 'comment', 'medical'],
    SWAP: ['shift', 'counterpart', 'counterpartShift', 'comment'],
    EXTRA_SHIFT: ['date', 'template', 'comment'],
    CANNOT_ATTEND: ['shift', 'comment'],
    LATE: ['shift', 'minutes', 'comment'],
    EARLY_LEAVE: ['shift', 'minutes', 'comment'],
    TECH_ISSUE: ['comment'],
    CORRECTION: ['reason', 'comment'],
    APPEAL: ['comment'],
  };
  async function submitRq(
    ctx: BotContext,
    pending: PendingRequest,
    medical?: { fileId: string; uniqueId: string },
  ): Promise<void> {
    if (!ctx.employee) return;
    const idempotencyKey = `tg:${ctx.update.update_id}`;
    const comment = pending.comment ?? '';
    const p = pending;
    try {
      let cmd: Parameters<RequestsService['create']>[1];
      switch (p.type) {
        case 'VACATION':
        case 'DAY_OFF':
          cmd = {
            type: p.type,
            periodFrom: p.periodFrom ?? '',
            periodTo: p.periodTo ?? '',
            comment,
            idempotencyKey,
          };
          break;
        case 'SICK':
          cmd = {
            type: 'SICK',
            periodFrom: p.periodFrom ?? '',
            periodTo: p.periodTo ?? '',
            ...(comment ? { comment } : {}),
            ...(medical
              ? {
                  medicalPhoto: {
                    telegramFileId: medical.fileId,
                    telegramFileUniqueId: medical.uniqueId,
                  },
                }
              : {}),
            idempotencyKey,
          };
          break;
        case 'SWAP':
          cmd = {
            type: 'SWAP',
            assignmentId: p.assignmentId ?? '',
            counterpartEmployeeId: p.counterpartEmployeeId ?? '',
            counterpartAssignmentId: p.counterpartAssignmentId ?? '',
            comment,
            idempotencyKey,
          };
          break;
        case 'EXTRA_SHIFT':
          cmd = {
            type: 'EXTRA_SHIFT',
            businessDate: p.businessDate ?? '',
            templateId: p.templateId ?? '',
            comment,
            idempotencyKey,
          };
          break;
        case 'CANNOT_ATTEND':
          cmd = {
            type: 'CANNOT_ATTEND',
            assignmentId: p.assignmentId ?? '',
            comment,
            idempotencyKey,
          };
          break;
        case 'LATE':
        case 'EARLY_LEAVE':
          cmd = {
            type: p.type,
            assignmentId: p.assignmentId ?? '',
            minutes: p.minutes ?? 0,
            comment,
            idempotencyKey,
          };
          break;
        case 'CORRECTION':
          cmd = {
            type: 'CORRECTION',
            shiftSessionId: p.shiftSessionId ?? '',
            reasonCode: p.reasonCode ?? 'OTHER',
            comment,
            idempotencyKey,
          };
          break;
        case 'APPEAL':
          cmd = { type: 'APPEAL', shiftSessionId: p.shiftSessionId ?? '', comment, idempotencyKey };
          break;
        default:
          cmd = { type: 'TECH_ISSUE', comment, idempotencyKey };
      }
      await deps.requests.create(ctx.employee.id, cmd, employeeActor(ctx.employee.id));
      await clearRq(ctx);
      await show(ctx, { text: t.requests.submitted });
    } catch (error) {
      deps.logger.warn({ err: error }, 'звернення відхилено');
      await clearRq(ctx);
      await show(ctx, {
        text: (error as { message?: string }).message ?? t.errors.ACTION_NOT_ALLOWED,
      });
    }
    await show(ctx, await buildHome(ctx));
  }
  async function afterField(ctx: BotContext, pending: PendingRequest): Promise<void> {
    const steps = STEP_ORDER[pending.type];
    const next = steps[steps.indexOf(pending.step) + 1];
    if (!next) return submitRq(ctx, pending);
    await askRq(ctx, { ...pending, step: next }, (s) => show(ctx, s));
  }

  bot.callbackQuery(/^rq:menu$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    await clearRq(ctx);
    await edit(ctx, requestMenuScreen());
  });

  bot.callbackQuery(/^rq:list$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    await edit(ctx, requestListScreen(await deps.requests.mine(ctx.employee.id)));
  });

  bot.callbackQuery(/^rq:pending$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    const pending = await deps.requests.pendingCounterpart(ctx.employee.id);
    await edit(ctx, pending.length > 0 ? counterpartScreen(pending) : await buildHome(ctx));
  });

  bot.callbackQuery(/^rq:t:([A-Z_]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    const type = ctx.match[1] ?? '';
    if (!isRequestType(type)) return;
    await askRq(ctx, { type, step: STEP_ORDER[type][0] ?? 'comment' }, (s) => edit(ctx, s));
  });

  bot.callbackQuery(/^rq:corr:([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    await askRq(
      ctx,
      { type: 'CORRECTION', step: 'reason', shiftSessionId: ctx.match[1] ?? '' },
      (s) => edit(ctx, s),
    );
  });

  bot.callbackQuery(/^rq:(a|ca|c|tpl|r):([A-Za-z0-9_-]{1,64})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    const pending = await readRq(ctx);
    if (!pending) return edit(ctx, requestMenuScreen());
    const value = ctx.match[2] ?? '';
    const kind = ctx.match[1];
    const patched: PendingRequest =
      kind === 'a'
        ? { ...pending, assignmentId: value }
        : kind === 'ca'
          ? { ...pending, counterpartAssignmentId: value }
          : kind === 'c'
            ? { ...pending, counterpartEmployeeId: value }
            : kind === 'tpl'
              ? { ...pending, templateId: value }
              : { ...pending, reasonCode: value };
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    await afterField(ctx, patched);
  });

  bot.callbackQuery(/^rq:skip$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const pending = await readRq(ctx);
    if (!pending) return edit(ctx, requestMenuScreen());
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    if (pending.step === 'medical') return submitRq(ctx, pending);
    await afterField(ctx, pending);
  });

  bot.callbackQuery(/^rq:cancel$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearRq(ctx);
    await edit(ctx, { text: t.requests.cancelled });
    await show(ctx, await buildHome(ctx));
  });

  // Згода або відмова другого працівника в обміні (крок COUNTERPART).
  bot.callbackQuery(/^rq:(ok|no):([0-9a-f-]{36})$/, async (ctx) => {
    if (!guardEmployee(ctx)) return ctx.answerCallbackQuery();
    try {
      await deps.requests.decide(
        ctx.match[2] ?? '',
        {
          decision: ctx.match[1] === 'ok' ? 'APPROVED' : 'REJECTED',
          comment: ctx.match[1] === 'ok' ? t.requests.counterpartYes : t.requests.counterpartNo,
        },
        { ...employeeActor(ctx.employee.id), roles: [], employeeId: ctx.employee.id },
      );
      await ctx.answerCallbackQuery({ text: t.requests.submitted });
    } catch (error) {
      deps.logger.warn({ err: error }, 'рішення другого працівника відхилено');
      await ctx.answerCallbackQuery({ text: t.errors.ACTION_NOT_ALLOWED, show_alert: true });
    }
    await ctx.editMessageReplyMarkup().catch(() => undefined);
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
    const rq = await readRq(ctx);
    if (rq && ctx.employee) {
      const text = ctx.message.text.trim().slice(0, 2000);
      if (rq.step === 'period' || rq.step === 'date') {
        const period = parsePeriod(text, new Date());
        if (!period) return show(ctx, requestPromptScreen(t.requests.badPeriod));
        const patched: PendingRequest =
          rq.step === 'period'
            ? { ...rq, periodFrom: period.from, periodTo: period.to }
            : { ...rq, businessDate: period.from };
        return afterField(ctx, patched);
      }
      if (rq.step === 'minutes') {
        const minutes = Number(text);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720)
          return show(ctx, requestPromptScreen(t.requests.badMinutes));
        return afterField(ctx, { ...rq, minutes });
      }
      if (rq.step === 'comment') {
        if (text.length < 3) return show(ctx, requestPromptScreen(t.requests.askComment));
        return afterField(ctx, { ...rq, comment: text });
      }
    }
    const hv = await readHv(ctx);
    if (hv && ctx.employee) {
      const text = ctx.message.text.trim().slice(0, 2000);
      if (hv.kind === 'note') {
        await deps.handover.answer(
          ctx.employee.id,
          { itemKey: 'MESSAGE_NEXT', ok: true, note: text },
          employeeActor(ctx.employee.id),
        );
        await clearHv(ctx);
        const view = await deps.handover.current(ctx.employee.id);
        return show(ctx, view ? handoverScreen(view, '') : await buildHome(ctx));
      }
      if (hv.kind === 'remark' && hv.step === 'text') {
        if (hv.itemKey.startsWith('CANNOT:')) {
          await deps.handover.cannotComplete(
            ctx.employee.id,
            { reasonCode: hv.itemKey.slice('CANNOT:'.length), comment: text },
            employeeActor(ctx.employee.id),
          );
          await clearHv(ctx);
          const view = await deps.handover.current(ctx.employee.id);
          return show(ctx, view ? handoverScreen(view, '') : await buildHome(ctx));
        }
        await writeHv(ctx, { ...hv, text, step: 'safe' });
        return show(ctx, handoverSafeScreen());
      }
      if (hv.kind === 'review' && hv.step === 'comment') {
        await writeHv(ctx, { ...hv, comment: text, step: 'photo' });
        return show(ctx, handoverTextPromptScreen(t.handover.reviewPhoto));
      }
    }
    await show(ctx, await buildHome(ctx));
  });

  bot.on('message:photo', async (ctx) => {
    const largest = ctx.message.photo[ctx.message.photo.length - 1];
    const pending = await readPending(ctx);
    if (pending?.step === 'photo') {
      return nextStep(ctx, {
        ...pending,
        ...(largest ? { photoFileId: largest.file_id } : {}),
        step: 'stop',
      });
    }
    const rq = await readRq(ctx);
    if (rq?.step === 'medical' && ctx.employee && largest) {
      return submitRq(ctx, rq, { fileId: largest.file_id, uniqueId: largest.file_unique_id });
    }
    const hv = await readHv(ctx);
    if (hv && ctx.employee && largest) {
      if (hv.kind === 'photo') {
        try {
          const view = await deps.handover.attachPhoto(
            ctx.employee.id,
            {
              angle: hv.angle,
              telegramFileId: largest.file_id,
              telegramFileUniqueId: largest.file_unique_id,
              ...(largest.file_size !== undefined ? { sizeBytes: largest.file_size } : {}),
              width: largest.width,
              height: largest.height,
            },
            employeeActor(ctx.employee.id),
          );
          await clearHv(ctx);
          await show(ctx, {
            text: format(t.handover.photoSaved, { angle: t.handover.angles[hv.angle] }),
          });
          return show(ctx, handoverScreen(view, ''));
        } catch (error) {
          deps.logger.warn({ err: error }, 'фото передачі відхилено');
          await clearHv(ctx);
          return show(ctx, await buildHome(ctx));
        }
      }
      if (hv.kind === 'review' && hv.step === 'photo') {
        try {
          await deps.handover.review(
            ctx.employee.id,
            hv.handoverId,
            {
              decision: 'ISSUE',
              ...(hv.category ? { category: hv.category } : {}),
              ...(hv.comment ? { comment: hv.comment } : {}),
              telegramFileId: largest.file_id,
              telegramFileUniqueId: largest.file_unique_id,
              idempotencyKey: `tg:${ctx.update.update_id}`,
            },
            employeeActor(ctx.employee.id),
          );
          await clearHv(ctx);
          await show(ctx, { text: t.handover.reviewIssueSaved });
        } catch (error) {
          deps.logger.warn({ err: error }, 'зауваження приймаючого відхилено');
          await clearHv(ctx);
          await show(ctx, { text: t.errors.ACTION_NOT_ALLOWED });
        }
        return show(ctx, await buildHome(ctx));
      }
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
