import { Bot, InlineKeyboard } from 'grammy';
import type { TelegramContactsService } from '../identity/telegram-contacts.service.js';
import type { Logger } from 'pino';
import {
  businessDateOf,
  codeFromDeepLink,
  employeeAccess,
  isActivationDeepLink,
  isLocale,
  isMonth,
  isValidStartParam,
  normalizeActivationCode,
  resolveLocale,
} from '@vakhta/domain';
import { REQUEST_TYPES, SHIFT_ACTIONS, type RequestType, type ShiftAction } from '@vakhta/domain';
import { format, messages, type Messages } from '@vakhta/i18n';
import { employeeActor } from '../common/actor.js';
import type { AttendanceService } from '../attendance/attendance.service.js';
import type { ActivationService } from '../identity/activation.service.js';
import type { EmployeesService } from '../identity/employees.service.js';
import type { ScheduleService } from '../scheduling/schedule.service.js';
import type { ShiftService } from '../shift/shift.service.js';
import type { HandoverService } from '../handover/handover.service.js';
import type { IncidentsService } from '../incidents/incidents.service.js';
import type { BonusService } from '../bonus/bonus.service.js';
import type { RequestsService } from '../requests/requests.service.js';
import type { ShortTermStore } from '../infra/short-term-store.js';
import type { EmployeeRecord } from '../identity/employees.service.js';
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
  checklistItemLabel,
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
  languageScreen,
  myScoresScreen,
  pendingHandoverScreen,
  scoreDetailScreen,
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

/** Unfinished handover and acceptance steps; live in Redis next to the problem report. */
type PendingHandover =
  | { readonly kind: 'photo'; readonly itemKey: string }
  | { readonly kind: 'note'; readonly itemKey: string }
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

/** Unfinished request: type and the fields collected so far (spec 8.1). */
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

/** "12.10–16.10" or "12.10" → ISO dates in the nearest future. */
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

/** An unfinished problem report lives in Redis, not in process memory (ADR-11). */
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
  /** Public address of the user guide, if published. */
  readonly helpUrl?: string | null;
  /** Deep link to the support assistant bot, if configured. */
  readonly supportUrl?: string | null;
  readonly employees: EmployeesService;
  readonly activation: ActivationService;
  /** Records who wrote to the bot, so HR can send activation cards by username. */
  readonly contacts?: TelegramContactsService | undefined;
  readonly schedule: ScheduleService;
  readonly attendance: AttendanceService;
  readonly shift: ShiftService;
  readonly incidents: IncidentsService;
  readonly handover: HandoverService;
  readonly requests: RequestsService;
  readonly bonus: BonusService;
  readonly appealWindowDays: number;
  readonly store: ShortTermStore;
  readonly dedup: UpdateDedup;
  readonly defaultTimezone: string;
  readonly logger: Logger;
}

/** What the home screen needs; a subset of the bot dependencies so the server can render it too. */
export type HomeScreenDeps = Pick<
  BotDeps,
  | 'schedule'
  | 'attendance'
  | 'shift'
  | 'handover'
  | 'requests'
  | 'defaultTimezone'
  | 'helpUrl'
  | 'supportUrl'
>;

/**
 * The home screen of an active employee (spec 5.1): the schedule and presence summary, or the
 * shift screen while a shift is open or can be started. Used by the bot on every redraw and by
 * the server when the state changed elsewhere (master action, terminal, timer), so the employee
 * never has to write to the bot to see the new buttons.
 */
export async function renderHomeScreen(
  deps: HomeScreenDeps,
  t: Messages,
  employee: EmployeeRecord,
): Promise<Screen> {
  const [next, unacknowledged, presence, shiftRaw, pendingHandovers, pendingSwaps] =
    await Promise.all([
      deps.schedule.nextShift(employee.id),
      deps.schedule.unacknowledgedVersions(employee.id),
      deps.attendance.openPresence(employee.id),
      deps.shift.screen(employee.id),
      deps.handover.pendingForReceiver(employee.id),
      deps.requests.pendingCounterpart(employee.id),
    ]);
  const shift = { ...shiftRaw, pendingHandovers: pendingHandovers.length };
  const timezone = next?.timezone ?? deps.defaultTimezone;
  const home = homeScreen(t, {
    employee,
    next,
    unacknowledged: unacknowledged.length,
    presenceSince: presence?.arrivedAt ?? null,
    timezone,
    pendingSwaps: pendingSwaps.length,
    helpUrl: deps.helpUrl ?? null,
    supportUrl: deps.supportUrl ?? null,
  });
  // Spec 5.1: during the shift and right after it the home screen is the shift screen.
  if (shift.session || shift.allowedActions.includes('START_SHIFT')) {
    return shiftScreen(t, { ...shift, timezone }, home.text);
  }
  return home;
}

/**
 * Builds the grammY bot. No state is kept in process memory (ADR-11): every update resolves
 * the employee by Telegram user_id again, and pending confirmations live in Redis.
 */
export function createBot(token: string, deps: BotDeps): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  // ADR-3, level 1: a redelivered update_id (webhook or polling) never reaches the handlers.
  bot.use(async (ctx, next) => {
    if (!(await deps.dedup.claim(ctx.update.update_id))) {
      deps.logger.debug({ updateId: ctx.update.update_id }, 'duplicate update skipped');
      return;
    }
    await next();
  });

  // FR-AUTH-01: who writes and whether they have access. Only an active link yields an employee.
  // The language follows the employee's saved choice, then the Telegram client language.
  bot.use(async (ctx, next) => {
    const from = ctx.from;
    if (from && ctx.chat?.type === 'private' && deps.contacts) {
      deps.contacts.remember(from, ctx.chat.id).catch((e: unknown) => {
        deps.logger.warn({ err: e }, 'telegram contact not recorded');
      });
    }
    const linked = from ? await deps.employees.findByTelegramUserId(from.id) : null;
    ctx.employee = linked?.employee ?? null;
    ctx.access = employeeAccess(linked?.employee.status ?? null);
    ctx.locale = linked?.employee.locale ?? resolveLocale(from?.language_code);
    ctx.t = messages(ctx.locale);
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
      // Same text or an outdated message: send a new one instead.
      await show(ctx, screen);
    }
  }

  async function buildHome(ctx: BotContext): Promise<Screen> {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) {
      return ctx.access === 'NOT_REGISTERED' || ctx.access === 'ALLOWED'
        ? welcomeScreen(ctx.t)
        : accessDeniedScreen(ctx.t, ctx.access);
    }
    return renderHomeScreen(deps, ctx.t, ctx.employee);
  }

  /** Common tail for every shift button: a toast with the result and a redrawn screen. */
  async function finishShiftCommand(
    ctx: BotContext,
    result: Awaited<ReturnType<ShiftService['transition']>>,
  ): Promise<void> {
    if (!result.ok) {
      await ctx.answerCallbackQuery({
        text:
          result.error === 'VERSION_CONFLICT'
            ? ctx.t.shift.staleButton
            : ctx.t.errors[result.error],
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
    return planScreen(ctx.t, await deps.schedule.myPlan(ctx.employee.id, resolved));
  }

  async function startActivation(ctx: BotContext, rawCode: string): Promise<void> {
    if (!ctx.from) return;
    if (ctx.access === 'ALLOWED') return show(ctx, { text: ctx.t.bot.alreadyRegistered });
    if (ctx.access !== 'NOT_REGISTERED') return show(ctx, accessDeniedScreen(ctx.t, ctx.access));

    const preview = await deps.activation.preview(ctx.from.id, rawCode);
    if (!preview.ok) return show(ctx, { text: activationFailureText(ctx.t, preview.reason) });
    await show(ctx, activationPreviewScreen(ctx.t, preview));
  }

  /** Deep link from the terminal (FR-QR-02): show the single relevant action (FR-UI-01). */
  async function startCheckIn(ctx: BotContext, qrToken: string): Promise<void> {
    if (ctx.access === 'BLOCKED' || ctx.access === 'TERMINATED') {
      return show(ctx, accessDeniedScreen(ctx.t, ctx.access));
    }
    if (ctx.access === 'NOT_REGISTERED' || !ctx.employee) {
      return show(ctx, { text: `${ctx.t.attendance.activateFirst}\n\n${ctx.t.bot.askCode}` });
    }

    const preview = await deps.attendance.previewChallenge(qrToken);
    if (!preview.ok) return show(ctx, { text: ctx.t.attendance.failures[preview.reason] });
    const action = await deps.attendance.intent(ctx.employee.id);
    await show(
      ctx,
      checkInPromptScreen(ctx.t, {
        action,
        terminalName: preview.terminal.name,
        token: qrToken,
      }),
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

  bot.command('scores', async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) return show(ctx, await buildHome(ctx));
    const month = businessDateOf(new Date(), deps.defaultTimezone).slice(0, 7);
    await show(ctx, myScoresScreen(ctx.t, await deps.bonus.myScores(ctx.employee.id, month)));
  });

  bot.command('requests', async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) return show(ctx, await buildHome(ctx));
    await show(ctx, requestMenuScreen(ctx.t));
  });

  // /help: a short description of what the bot does and where the guide lives.
  bot.command('help', async (ctx) => {
    const url = deps.helpUrl ?? '';
    const support = deps.supportUrl ?? '';
    const keyboard = new InlineKeyboard();
    if (url) keyboard.url(`ℹ️ ${ctx.t.bot.helpButton}`, url);
    if (support) keyboard.url(`🆘 ${ctx.t.bot.supportButton}`, support);
    const lines = [format(ctx.t.bot.help, { url }).trim()];
    if (support) lines.push('', format(ctx.t.bot.supportHint, { url: support }));
    const text = lines.join('\n');
    await show(ctx, url || support ? { text, keyboard } : { text });
  });

  // Interface language: /language or the home-screen button; the choice is stored per employee.
  bot.command('language', async (ctx) => {
    await show(ctx, languageScreen(ctx.t, ctx.locale));
  });

  bot.callbackQuery(CALLBACK.languageMenu, async (ctx) => {
    await ctx.answerCallbackQuery();
    await edit(ctx, languageScreen(ctx.t, ctx.locale));
  });

  bot.callbackQuery(/^lang:(uk|en|ru)$/, async (ctx) => {
    const locale = ctx.match[1];
    if (!isLocale(locale)) return ctx.answerCallbackQuery();
    if (ctx.employee) await deps.employees.setLocale(ctx.employee.id, locale);
    ctx.locale = locale;
    ctx.t = messages(locale);
    await ctx.answerCallbackQuery({ text: ctx.t.language.changed });
    await edit(ctx, await buildHome(ctx));
  });

  bot.callbackQuery(CALLBACK.activationConfirm, async (ctx) => {
    const outcome = await deps.activation.confirm(ctx.from.id, ctx.from.language_code);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(activationOutcomeScreen(ctx.t, outcome).text);
  });

  bot.callbackQuery(CALLBACK.activationCancel, async (ctx) => {
    await deps.activation.cancel(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t.activation.cancelled);
  });

  // "I am at work" / "I have left" (FR-TIME-01, FR-TIME-05): result with server time (FR-UI-02).
  bot.callbackQuery(/^(arr|dep):([A-Za-z0-9_-]{22})$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) {
      await ctx.answerCallbackQuery({ text: ctx.t.bot.access.NOT_REGISTERED, show_alert: true });
      return;
    }
    const action = ctx.match[1] === 'arr' ? 'ARRIVE' : 'DEPART';
    const result = await deps.attendance.checkInByQr(ctx.employee.id, ctx.match[2] ?? '', action);
    await ctx.answerCallbackQuery();
    if (result.ok && action === 'ARRIVE') {
      // Arrival opens the shift at once (the master start in the panel stays as the reserve):
      // one screen with the shift buttons, no intermediate text. A refused start (a shift is
      // already open, the window is closed) simply shows the home screen with the reason inside.
      const started = await deps.shift.start(
        ctx.employee.id,
        { idempotencyKey: `tg:${ctx.update.update_id}:start` },
        { actor: employeeActor(ctx.employee.id), source: 'TELEGRAM' },
      );
      if (!started.ok) {
        deps.logger.info({ reason: started.error }, 'arrival recorded, shift not started');
      }
      await edit(ctx, await buildHome(ctx));
      return;
    }
    await edit(ctx, checkInResultScreen(ctx.t, result, deps.defaultTimezone));
    if (result.ok) await show(ctx, await buildHome(ctx));
  });

  // Shift buttons (spec 4.4): the version in callback data protects against stale buttons (spec 12.3).
  bot.callbackQuery(/^sh:pick:(DOWNTIME|EMERGENCY):(\d+)$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const view = await deps.shift.screen(ctx.employee.id);
    if (!view.session || String(view.session.version) !== ctx.match[2]) {
      return edit(ctx, await buildHome(ctx));
    }
    await edit(
      ctx,
      reasonPickerScreen(ctx.t, view, ctx.match[1] === 'DOWNTIME' ? 'DOWNTIME' : 'EMERGENCY'),
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
      await ctx.answerCallbackQuery({ text: ctx.t.shift.zoneAccepted });
    } catch (error) {
      deps.logger.warn({ err: error }, 'zone not accepted');
      await ctx.answerCallbackQuery({ text: ctx.t.errors.NO_ACTIVE_SHIFT });
    }
    await edit(ctx, await buildHome(ctx));
  });

  // "Report a problem" (spec 5.5): reason → comment/photo if required → "Is work stopped?"
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
    if (pending.step === 'comment') return show(ctx, incidentCommentScreen(ctx.t));
    if (pending.step === 'photo') return show(ctx, incidentPhotoScreen(ctx.t));
    return show(ctx, incidentStoppedScreen(ctx.t, pending.reasonLabel));
  }

  bot.callbackQuery(/^inc:new:(\d+)$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const view = await deps.shift.screen(ctx.employee.id);
    if (!view.session || view.session.endedAt) return edit(ctx, { text: ctx.t.incidents.noShift });
    await edit(ctx, incidentReasonScreen(ctx.t, view.downtimeReasons));
  });

  bot.callbackQuery(/^inc:r:([A-Z][A-Z0-9_]{1,63})$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) return ctx.answerCallbackQuery();
    const reason = await deps.incidents.reason(ctx.match[1] ?? '');
    await ctx.answerCallbackQuery();
    if (!reason) return edit(ctx, { text: ctx.t.shift.noReasons });
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
    if (!pending) return edit(ctx, { text: ctx.t.incidents.expired });
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    await nextStep(ctx, { ...pending, step: 'stop' });
  });

  bot.callbackQuery(/^inc:cancel$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearPending(ctx);
    await edit(ctx, { text: ctx.t.incidents.cancelled });
    await show(ctx, await buildHome(ctx));
  });

  bot.callbackQuery(/^inc:stop:(1|0)$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) return ctx.answerCallbackQuery();
    const pending = await readPending(ctx);
    if (!pending) {
      await ctx.answerCallbackQuery();
      return edit(ctx, { text: ctx.t.incidents.expired });
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
      await edit(ctx, incidentResultScreen(ctx.t, result, pending.reasonLabel));
    } catch (error) {
      deps.logger.warn({ err: error }, 'problem report rejected');
      await clearPending(ctx);
      await ctx.answerCallbackQuery({ text: ctx.t.incidents.noShift, show_alert: true });
    }
    await show(ctx, await buildHome(ctx));
  });

  // Cleaning and handover (spec 5.6-5.8): checklist, photos, submission; acceptance by the next shift.
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
    await edit(ctx, handoverScreen(ctx.t, view, ''));
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

  bot.callbackQuery(/^hv:ok:([A-Z][A-Z0-9_]{1,31})$/, async (ctx) => {
    if (!guardEmployee(ctx)) return ctx.answerCallbackQuery();
    try {
      await deps.handover.answer(
        ctx.employee.id,
        { itemKey: ctx.match[1] ?? '', ok: true },
        employeeActor(ctx.employee.id),
      );
      await ctx.answerCallbackQuery();
    } catch (error) {
      deps.logger.warn({ err: error }, 'checklist answer rejected');
      await ctx.answerCallbackQuery({ text: ctx.t.errors.ACTION_NOT_ALLOWED, show_alert: true });
    }
    await showHandover(ctx);
  });

  bot.callbackQuery(/^hv:rem:([A-Z][A-Z0-9_]{1,31})$/, async (ctx) => {
    if (!guardEmployee(ctx)) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const view = await deps.handover.current(ctx.employee.id);
    const item = view?.items.find((i) => i.key === ctx.match[1]);
    if (!view || !item) return showHandover(ctx);
    await writeHv(ctx, { kind: 'remark', itemKey: item.key, step: 'category' });
    const label = checklistItemLabel(ctx.t, item);
    await edit(ctx, handoverRemarkCategoryScreen(ctx.t, label, await handoverReasons()));
  });

  bot.callbackQuery(/^hv:rc:([A-Z][A-Z0-9_]{1,63})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const pending = await readHv(ctx);
    if (pending?.kind !== 'remark') return showHandover(ctx);
    await writeHv(ctx, { ...pending, category: ctx.match[1] ?? '', step: 'text' });
    await edit(ctx, handoverTextPromptScreen(ctx.t, ctx.t.handover.askRemarkText));
  });

  bot.callbackQuery(/^hv:safe:(1|0)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const pending = await readHv(ctx);
    if (pending?.kind !== 'remark') return showHandover(ctx);
    await writeHv(ctx, { ...pending, safeToWork: ctx.match[1] === '1', step: 'needs' });
    await edit(ctx, handoverNeedsScreen(ctx.t));
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
      await ctx.answerCallbackQuery({ text: ctx.t.handover.remarkSaved });
    } catch (error) {
      deps.logger.warn({ err: error }, 'remark rejected');
      await ctx.answerCallbackQuery({ text: ctx.t.errors.ACTION_NOT_ALLOWED, show_alert: true });
    }
    await clearHv(ctx);
    await showHandover(ctx);
  });

  bot.callbackQuery(/^hv:note:([A-Z][A-Z0-9_]{1,31})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    const view = await deps.handover.current(ctx.employee.id);
    const item = view?.items.find((i) => i.key === ctx.match[1] && i.kind === 'NOTE');
    if (!view || !item) return showHandover(ctx);
    await writeHv(ctx, { kind: 'note', itemKey: item.key });
    await edit(ctx, handoverTextPromptScreen(ctx.t, ctx.t.handover.askNote));
  });

  // A photo item of the checklist: the next photo message lands on it (FR-PHO-01, FR-PHO-05).
  bot.callbackQuery(/^hv:ph:([A-Z][A-Z0-9_]{1,31})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    const view = await deps.handover.current(ctx.employee.id);
    const item = view?.items.find((i) => i.key === ctx.match[1] && i.kind === 'PHOTO');
    if (!view || !item) return showHandover(ctx);
    await writeHv(ctx, { kind: 'photo', itemKey: item.key });
    await edit(ctx, handoverPhotoPromptScreen(ctx.t, checklistItemLabel(ctx.t, item)));
  });

  bot.callbackQuery(/^hv:cannot$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    await edit(ctx, cannotCompleteReasonScreen(ctx.t, await handoverReasons()));
  });

  bot.callbackQuery(/^hv:cr:([A-Z][A-Z0-9_]{1,63})$/, async (ctx) => {
    if (!guardEmployee(ctx)) return ctx.answerCallbackQuery();
    try {
      await deps.handover.cannotComplete(
        ctx.employee.id,
        { reasonCode: ctx.match[1] ?? '' },
        employeeActor(ctx.employee.id),
      );
      await ctx.answerCallbackQuery({ text: ctx.t.handover.cannotCompleteSaved, show_alert: true });
    } catch (error) {
      // "Other" requires a comment: ask for the text and keep it in the pending state.
      deps.logger.debug({ err: error }, 'reason requires a comment');
      await ctx.answerCallbackQuery();
      await writeHv(ctx, {
        kind: 'remark',
        itemKey: `CANNOT:${ctx.match[1]}`,
        step: 'text',
        category: ctx.match[1] ?? '',
      });
      return edit(ctx, handoverTextPromptScreen(ctx.t, ctx.t.incidents.askComment));
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
        text: result.ok ? ctx.t.handover.submitted : ctx.t.handover.notReady,
        show_alert: !result.ok,
      });
      if (!result.ok) return edit(ctx, handoverScreen(ctx.t, result.handover, ''));
    } catch (error) {
      deps.logger.warn({ err: error }, 'handover submission rejected');
      await ctx.answerCallbackQuery({ text: ctx.t.errors.ACTION_NOT_ALLOWED, show_alert: true });
    }
    await edit(ctx, await buildHome(ctx));
  });

  bot.callbackQuery(/^hv:cancel$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearHv(ctx);
    if (!guardEmployee(ctx)) return;
    const view = await deps.handover.current(ctx.employee.id);
    await edit(ctx, view ? handoverScreen(ctx.t, view, '') : await buildHome(ctx));
  });

  // Acceptance by the next shift (FR-HND-03/04).
  bot.callbackQuery(/^hr:open$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    const pending = await deps.handover.pendingForReceiver(ctx.employee.id);
    if (pending.length === 0) return edit(ctx, await buildHome(ctx));
    await edit(ctx, pendingHandoverScreen(ctx.t, pending, deps.defaultTimezone));
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
      await ctx.answerCallbackQuery({ text: ctx.t.handover.reviewAccepted });
    } catch (error) {
      deps.logger.warn({ err: error }, 'acceptance rejected');
      const code = (error as { code?: string }).code;
      await ctx.answerCallbackQuery({
        text:
          code === 'REVIEW_OWN_HANDOVER'
            ? ctx.t.handover.reviewOwn
            : ctx.t.errors.ACTION_NOT_ALLOWED,
        show_alert: true,
      });
    }
    await edit(ctx, await buildHome(ctx));
  });

  bot.callbackQuery(/^hr:issue:([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    await writeHv(ctx, { kind: 'review', handoverId: ctx.match[1] ?? '', step: 'category' });
    await edit(ctx, reviewCategoryScreen(ctx.t, await handoverReasons()));
  });

  bot.callbackQuery(/^hr:rc:([A-Z][A-Z0-9_]{1,63})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const pending = await readHv(ctx);
    if (pending?.kind !== 'review') return edit(ctx, await buildHome(ctx));
    await writeHv(ctx, { ...pending, category: ctx.match[1] ?? '', step: 'comment' });
    await edit(ctx, handoverTextPromptScreen(ctx.t, ctx.t.handover.reviewComment));
  });

  // Requests (spec 8, FR-SCH-05): type → fields per type → comment → submission.
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
    const t = ctx.t;
    switch (pending.step) {
      case 'period':
      case 'date':
        return render(requestPromptScreen(t, t.requests.askPeriod));
      case 'shift':
        return render(
          requestAssignmentScreen(
            t,
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
            t,
            candidates.map((c) => ({ id: c.id, label: c.fullName })),
            'rq:c:',
            t.requests.chooseCounterpart,
          ),
        );
      }
      case 'counterpartShift':
        return render(
          requestAssignmentScreen(
            t,
            await deps.requests.upcomingAssignments(pending.counterpartEmployeeId ?? ''),
            'rq:ca:',
            t.requests.chooseCounterpartShift,
          ),
        );
      case 'template': {
        const templates = await deps.requests.templatesFor(ctx.employee.id);
        return render(
          requestChoiceScreen(
            t,
            templates.map((x) => ({ id: x.id, label: x.name })),
            'rq:tpl:',
            t.requests.chooseTemplate,
          ),
        );
      }
      case 'minutes':
        return render(requestPromptScreen(t, t.requests.askMinutes));
      case 'reason':
        return render(
          requestChoiceScreen(
            t,
            (await deps.incidents.reasonOptions('CORRECTION')).map((r) => ({
              id: r.code,
              label: r.label,
            })),
            'rq:r:',
            t.incidents.chooseReason,
          ),
        );
      case 'comment':
        return render(requestPromptScreen(t, t.requests.askComment, pending.type === 'SICK'));
      case 'medical':
        return render(requestPromptScreen(t, t.requests.askMedical, true));
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
      await show(ctx, { text: ctx.t.requests.submitted });
    } catch (error) {
      deps.logger.warn({ err: error }, 'request rejected');
      await clearRq(ctx);
      // Domain errors carry a stable code; the text comes from the employee's catalog.
      const code = (error as { code?: string }).code ?? '';
      const known = (ctx.t.errors as Record<string, string>)[code];
      await show(ctx, { text: known ?? ctx.t.errors.ACTION_NOT_ALLOWED });
    }
    await show(ctx, await buildHome(ctx));
  }
  async function afterField(ctx: BotContext, pending: PendingRequest): Promise<void> {
    const steps = STEP_ORDER[pending.type];
    const next = steps[steps.indexOf(pending.step) + 1];
    if (!next) return submitRq(ctx, pending);
    await askRq(ctx, { ...pending, step: next }, (s) => show(ctx, s));
  }

  // Scores (spec 7.7): month, breakdown, appeal within the window.
  bot.callbackQuery(/^bn:(me|m:(\d{4}-\d{2}))$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    const month = ctx.match[2] ?? businessDateOf(new Date(), deps.defaultTimezone).slice(0, 7);
    await edit(ctx, myScoresScreen(ctx.t, await deps.bonus.myScores(ctx.employee.id, month)));
  });

  bot.callbackQuery(/^bn:d:([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    const score = await deps.bonus.score(ctx.match[1] ?? '').catch(() => null);
    if (!score || score.employeeId !== ctx.employee.id) return edit(ctx, await buildHome(ctx));
    const ageDays = (Date.now() - new Date(score.computedAt).getTime()) / 86_400_000;
    const canAppeal =
      score.status !== 'APPEALED' &&
      score.status !== 'NOT_EVALUATED' &&
      ageDays <= deps.appealWindowDays + 2;
    await edit(ctx, scoreDetailScreen(ctx.t, score, deps.appealWindowDays, canAppeal));
  });

  bot.callbackQuery(/^bn:ap:([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    await askRq(ctx, { type: 'APPEAL', step: 'comment', shiftSessionId: ctx.match[1] ?? '' }, (s) =>
      edit(ctx, s),
    );
  });

  bot.callbackQuery(/^rq:menu$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    await clearRq(ctx);
    await edit(ctx, requestMenuScreen(ctx.t));
  });

  bot.callbackQuery(/^rq:list$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    await edit(ctx, requestListScreen(ctx.t, await deps.requests.mine(ctx.employee.id)));
  });

  bot.callbackQuery(/^rq:pending$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!guardEmployee(ctx)) return;
    const pending = await deps.requests.pendingCounterpart(ctx.employee.id);
    await edit(ctx, pending.length > 0 ? counterpartScreen(ctx.t, pending) : await buildHome(ctx));
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
    if (!pending) return edit(ctx, requestMenuScreen(ctx.t));
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
    if (!pending) return edit(ctx, requestMenuScreen(ctx.t));
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    if (pending.step === 'medical') return submitRq(ctx, pending);
    await afterField(ctx, pending);
  });

  bot.callbackQuery(/^rq:cancel$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearRq(ctx);
    await edit(ctx, { text: ctx.t.requests.cancelled });
    await show(ctx, await buildHome(ctx));
  });

  // Consent or refusal of the second employee in a swap (COUNTERPART step).
  bot.callbackQuery(/^rq:(ok|no):([0-9a-f-]{36})$/, async (ctx) => {
    if (!guardEmployee(ctx)) return ctx.answerCallbackQuery();
    try {
      await deps.requests.decide(
        ctx.match[2] ?? '',
        {
          decision: ctx.match[1] === 'ok' ? 'APPROVED' : 'REJECTED',
          comment:
            ctx.match[1] === 'ok' ? ctx.t.requests.counterpartYes : ctx.t.requests.counterpartNo,
        },
        { ...employeeActor(ctx.employee.id), roles: [], employeeId: ctx.employee.id },
      );
      await ctx.answerCallbackQuery({ text: ctx.t.requests.submitted });
    } catch (error) {
      deps.logger.warn({ err: error }, 'counterpart decision rejected');
      await ctx.answerCallbackQuery({ text: ctx.t.errors.ACTION_NOT_ALLOWED, show_alert: true });
    }
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    await show(ctx, await buildHome(ctx));
  });

  bot.callbackQuery(/^sh:([A-Z_]+):(\d+)(?::([A-Z][A-Z0-9_]{1,63}))?$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) {
      await ctx.answerCallbackQuery({ text: ctx.t.bot.access.NOT_REGISTERED, show_alert: true });
      return;
    }
    const action = ctx.match[1] ?? '';
    if (!isShiftAction(action)) return ctx.answerCallbackQuery({ text: ctx.t.bot.notReady });
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

  // "Acknowledged" from a notification (ack:<versionId>) or from the home screen (ack:all).
  bot.callbackQuery(/^ack:(all|[0-9a-f-]{36})$/, async (ctx) => {
    if (ctx.access !== 'ALLOWED' || !ctx.employee) {
      await ctx.answerCallbackQuery({ text: ctx.t.bot.access.NOT_REGISTERED, show_alert: true });
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
        deps.logger.warn({ err: error, versionId }, 'acknowledgement rejected');
      }
    }
    await ctx.answerCallbackQuery({
      text: acknowledged > 0 ? ctx.t.schedule.ackDone : ctx.t.schedule.ackNothing,
    });
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    await show(ctx, await buildHome(ctx));
  });

  bot.on('message:text', async (ctx) => {
    if (ctx.access === 'NOT_REGISTERED') {
      const code = normalizeActivationCode(ctx.message.text);
      if (code) return startActivation(ctx, code);
      return show(ctx, { text: ctx.t.bot.askCode });
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
        if (!period) return show(ctx, requestPromptScreen(ctx.t, ctx.t.requests.badPeriod));
        const patched: PendingRequest =
          rq.step === 'period'
            ? { ...rq, periodFrom: period.from, periodTo: period.to }
            : { ...rq, businessDate: period.from };
        return afterField(ctx, patched);
      }
      if (rq.step === 'minutes') {
        const minutes = Number(text);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720)
          return show(ctx, requestPromptScreen(ctx.t, ctx.t.requests.badMinutes));
        return afterField(ctx, { ...rq, minutes });
      }
      if (rq.step === 'comment') {
        if (text.length < 3)
          return show(ctx, requestPromptScreen(ctx.t, ctx.t.requests.askComment));
        return afterField(ctx, { ...rq, comment: text });
      }
    }
    const hv = await readHv(ctx);
    if (hv && ctx.employee) {
      const text = ctx.message.text.trim().slice(0, 2000);
      if (hv.kind === 'note') {
        await deps.handover.answer(
          ctx.employee.id,
          { itemKey: hv.itemKey, ok: true, note: text },
          employeeActor(ctx.employee.id),
        );
        await clearHv(ctx);
        const view = await deps.handover.current(ctx.employee.id);
        return show(ctx, view ? handoverScreen(ctx.t, view, '') : await buildHome(ctx));
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
          return show(ctx, view ? handoverScreen(ctx.t, view, '') : await buildHome(ctx));
        }
        await writeHv(ctx, { ...hv, text, step: 'safe' });
        return show(ctx, handoverSafeScreen(ctx.t));
      }
      if (hv.kind === 'review' && hv.step === 'comment') {
        await writeHv(ctx, { ...hv, comment: text, step: 'photo' });
        return show(ctx, handoverTextPromptScreen(ctx.t, ctx.t.handover.reviewPhoto));
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
              itemKey: hv.itemKey,
              telegramFileId: largest.file_id,
              telegramFileUniqueId: largest.file_unique_id,
              ...(largest.file_size !== undefined ? { sizeBytes: largest.file_size } : {}),
              width: largest.width,
              height: largest.height,
            },
            employeeActor(ctx.employee.id),
          );
          await clearHv(ctx);
          const item = view.items.find((i) => i.key === hv.itemKey);
          await show(ctx, {
            text: format(ctx.t.handover.photoSaved, {
              item: item ? checklistItemLabel(ctx.t, item) : hv.itemKey,
            }),
          });
          return show(ctx, handoverScreen(ctx.t, view, ''));
        } catch (error) {
          deps.logger.warn({ err: error }, 'handover photo rejected');
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
          await show(ctx, { text: ctx.t.handover.reviewIssueSaved });
        } catch (error) {
          deps.logger.warn({ err: error }, 'receiver remark rejected');
          await clearHv(ctx);
          await show(ctx, { text: ctx.t.errors.ACTION_NOT_ALLOWED });
        }
        return show(ctx, await buildHome(ctx));
      }
    }
    await show(ctx, { text: ctx.t.bot.useButtons });
  });

  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery({ text: ctx.t.bot.notReady });
  });

  bot.on('message', async (ctx) => {
    await show(ctx, { text: ctx.t.bot.useButtons });
  });

  bot.catch((err) => {
    deps.logger.error(
      { err: err.error, updateId: err.ctx.update.update_id },
      'error in bot handler',
    );
  });

  return bot;
}
