import { Composer, InputFile } from 'grammy';
import type { Logger } from 'pino';
import { z } from 'zod';
import {
  MaintenanceCallbackAction,
  OPERATION_RESULTS,
  OperationResult,
  WAIT_REASONS,
  parseMaintenanceCallback,
  type EmployeeAccess,
  type MaintenanceCallback,
} from '@vakhta/domain';
import { format, type Messages } from '@vakhta/i18n';
import { MaterialsUsedKind } from '@vakhta/contracts';
import { DomainError } from '../common/domain-error.js';
import type { ShortTermStore } from '../infra/short-term-store.js';
import { ManualKind, type DocumentsService } from '../maintenance/documents.service.js';
import type { EmergencyService } from '../maintenance/emergency.service.js';
import type { MechanicWorkService } from '../maintenance/mechanic-work.service.js';
import type { OperationPhoto, WorkActionsService } from '../maintenance/work-actions.service.js';
import type { BotContext } from './bot-context.js';
import {
  MissingStep,
  UsedArg,
  hasMissingChecklist,
  materialsUsedScreen,
  missingNote,
  missingScreen,
  myWorkScreen,
  parseAnswerArg,
  parseMissingArg,
  pauseScreen,
  workCardScreen,
} from './maintenance-screens.js';
import type { Screen } from './screens.js';

export interface MaintenanceBotDeps {
  readonly mechanic: MechanicWorkService;
  readonly actions: WorkActionsService;
  readonly emergency: EmergencyService;
  readonly documents: DocumentsService;
  readonly store: ShortTermStore;
  readonly logger: Logger;
}

/** A text or photo the mechanic owes after pressing a button; kept in Redis like other flows. */
const PendingStep = {
  MISSING: 'MISSING',
  USED: 'USED',
  REASON: 'REASON',
  PHOTO: 'PHOTO',
  SUMMARY: 'SUMMARY',
  DECLINE: 'DECLINE',
} as const;

const Pending = z.discriminatedUnion('step', [
  z.object({
    step: z.enum([PendingStep.USED, PendingStep.SUMMARY, PendingStep.DECLINE]),
    workOrderId: z.string().uuid(),
  }),
  z.object({
    step: z.literal(PendingStep.MISSING),
    workOrderId: z.string().uuid(),
    /** Materials already checked in the list; the text is added to them. */
    mask: z.number().int().nonnegative().default(0),
  }),
  z.object({
    step: z.literal(PendingStep.REASON),
    workOrderId: z.string().uuid(),
    ordinal: z.number().int().positive(),
    result: z.enum(OPERATION_RESULTS),
  }),
  z.object({
    step: z.literal(PendingStep.PHOTO),
    workOrderId: z.string().uuid(),
    ordinal: z.number().int().positive(),
  }),
]);
type Pending = z.infer<typeof Pending>;
type TextPending = Exclude<Pending, { step: typeof PendingStep.PHOTO }>;

const ALLOWED: EmployeeAccess = 'ALLOWED';
const PENDING_TTL_SECONDS = 900;
const TEXT_LIMIT = 2000;
const PDF_EXTENSION = '.pdf';

/** A parsed button press of a maintenance employee. */
interface Press {
  readonly employeeId: string;
  readonly workOrderId: string;
  readonly arg: string | null;
}

type Handler = (ctx: BotContext, press: Press) => Promise<void>;

function errorText(t: Messages, error: DomainError): string {
  const errors: Readonly<Record<string, string>> = t.maintenance.bot.errors;
  return errors[error.code] ?? t.maintenance.bot.stateChanged;
}

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

function largestPhoto(ctx: BotContext): OperationPhoto | null {
  const largest = ctx.message?.photo?.at(-1);
  if (!largest) return null;
  return {
    fileId: largest.file_id,
    fileUniqueId: largest.file_unique_id,
    sizeBytes: largest.file_size,
    width: largest.width,
    height: largest.height,
  };
}

/**
 * The mechanic's maintenance flows in Telegram (spec 014, US5, US7): the work list, the card,
 * readiness, the checklist with photos, pauses, submission, and accepting or declining a repair.
 * Every button re-reads the work order; a stale button answers why and redraws the card.
 */
class MaintenanceBot {
  readonly handlers: Readonly<Record<MaintenanceCallbackAction, Handler>> = {
    [MaintenanceCallbackAction.LIST]: (ctx, press) => this.openList(ctx, press.employeeId),
    [MaintenanceCallbackAction.OPEN]: (ctx, press) => this.openCard(ctx, press.workOrderId),
    [MaintenanceCallbackAction.MANUAL]: (ctx, press) => this.sendManual(ctx, press.workOrderId),
    [MaintenanceCallbackAction.READY]: (ctx, press) =>
      this.change(ctx, press, () => this.deps.actions.readiness({ ...press, ready: true })),
    [MaintenanceCallbackAction.MISSING]: (ctx, press) => this.missing(ctx, press),
    [MaintenanceCallbackAction.START]: (ctx, press) =>
      this.change(ctx, press, () => this.deps.actions.start(press)),
    [MaintenanceCallbackAction.ANSWER]: (ctx, press) => this.answer(ctx, press),
    [MaintenanceCallbackAction.PAUSE]: (ctx, press) => this.pause(ctx, press),
    [MaintenanceCallbackAction.RESUME]: (ctx, press) =>
      this.change(ctx, press, () => this.deps.actions.resume(press)),
    [MaintenanceCallbackAction.SUBMIT]: (ctx, press) => this.submit(ctx, press),
    [MaintenanceCallbackAction.ACCEPT]: (ctx, press) =>
      this.change(ctx, press, () =>
        this.deps.emergency.accept(press.employeeId, press.workOrderId),
      ),
    [MaintenanceCallbackAction.DECLINE]: (ctx, press) =>
      this.ask(ctx, { step: PendingStep.DECLINE, workOrderId: press.workOrderId }),
    [MaintenanceCallbackAction.FINISH]: (ctx, press) =>
      this.ask(ctx, { step: PendingStep.SUMMARY, workOrderId: press.workOrderId }),
  };

  constructor(private readonly deps: MaintenanceBotDeps) {}

  private key(ctx: BotContext): string {
    return `maintenance:pending:${ctx.from?.id ?? 0}`;
  }

  async readPending(ctx: BotContext): Promise<Pending | null> {
    if (!ctx.from || !ctx.employee) return null;
    const raw = await this.deps.store.get(this.key(ctx));
    if (!raw) return null;
    const parsed = Pending.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  /** Who pressed: a maintenance employee with access; anyone else gets a toast and nothing more. */
  async press(ctx: BotContext, callback: MaintenanceCallback): Promise<Press | null> {
    const employeeId = ctx.employee?.id;
    if (ctx.access !== ALLOWED || !employeeId) return null;
    if (!(await this.deps.mechanic.isMaintenanceStaff(employeeId))) return null;
    return { employeeId, workOrderId: callback.workOrderId ?? '', arg: callback.arg };
  }

  private async cardScreen(ctx: BotContext, workOrderId: string): Promise<Screen> {
    const card = await this.deps.mechanic.card(workOrderId);
    if (!card) return { text: ctx.t.maintenance.bot.stateChanged };
    return workCardScreen(ctx.t, card);
  }

  private async openList(ctx: BotContext, employeeId: string): Promise<void> {
    await ctx.answerCallbackQuery();
    await edit(ctx, myWorkScreen(ctx.t, await this.deps.mechanic.list(employeeId)));
  }

  private async openCard(ctx: BotContext, workOrderId: string): Promise<void> {
    await ctx.answerCallbackQuery();
    await edit(ctx, await this.cardScreen(ctx, workOrderId));
  }

  /** Runs a change; a refused one tells why, and the card is redrawn with the current buttons. */
  private async change(ctx: BotContext, press: Press, run: () => Promise<unknown>) {
    try {
      await run();
      await ctx.answerCallbackQuery();
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      await ctx.answerCallbackQuery({ text: errorText(ctx.t, error), show_alert: true });
    }
    await edit(ctx, await this.cardScreen(ctx, press.workOrderId));
  }

  private prompt(t: Messages, pending: Pending): string {
    const bot = t.maintenance.bot;
    const prompts: Readonly<Record<Pending['step'], string>> = {
      [PendingStep.MISSING]: bot.missingPrompt,
      [PendingStep.USED]: bot.usedPrompt,
      [PendingStep.REASON]: bot.reasonPrompt,
      [PendingStep.PHOTO]: bot.photoPrompt,
      [PendingStep.SUMMARY]: bot.summaryPrompt,
      [PendingStep.DECLINE]: bot.declinePrompt,
    };
    return prompts[pending.step];
  }

  private async ask(ctx: BotContext, pending: Pending): Promise<void> {
    await this.deps.store.set(this.key(ctx), JSON.stringify(pending), PENDING_TTL_SECONDS);
    await ctx.answerCallbackQuery();
    await show(ctx, { text: this.prompt(ctx.t, pending) });
  }

  private async answer(ctx: BotContext, press: Press): Promise<void> {
    const answer = parseAnswerArg(press.arg);
    if (!answer) return this.openCard(ctx, press.workOrderId);
    const { workOrderId } = press;
    if (answer.result !== OperationResult.DONE)
      return this.ask(ctx, { step: PendingStep.REASON, workOrderId, ...answer });
    const card = await this.deps.mechanic.card(workOrderId);
    const operation = card?.notice.data.operations[answer.ordinal - 1];
    if (operation?.photoRequired)
      return this.ask(ctx, { step: PendingStep.PHOTO, workOrderId, ordinal: answer.ordinal });
    await this.change(ctx, press, () => this.deps.actions.answer({ ...press, ...answer }));
  }

  /** The checklist of missing materials, or a free text when the plan lists none or too many. */
  private async missing(ctx: BotContext, press: Press): Promise<void> {
    const { workOrderId } = press;
    const card = await this.deps.mechanic.card(workOrderId);
    const parsed = parseMissingArg(press.arg);
    if (!card || !parsed) return this.openCard(ctx, workOrderId);
    if (!hasMissingChecklist(card) || parsed.step === MissingStep.WRITE)
      return this.ask(ctx, { step: PendingStep.MISSING, workOrderId, mask: parsed.mask });
    if (parsed.step !== MissingStep.SEND) {
      await ctx.answerCallbackQuery();
      return edit(ctx, missingScreen(ctx.t, card, parsed.mask));
    }
    if (parsed.mask === 0) {
      await ctx.answerCallbackQuery({ text: ctx.t.maintenance.bot.missingNoneSelected });
      return;
    }
    const note = missingNote(card, parsed.mask, null);
    await this.change(ctx, press, () =>
      this.deps.actions.readiness({ ...press, ready: false, note }),
    );
  }

  /** Planned work with materials first confirms what was used (FR-051). */
  private async submit(ctx: BotContext, press: Press): Promise<void> {
    const { workOrderId } = press;
    if (press.arg === UsedArg.OTHER) return this.ask(ctx, { step: PendingStep.USED, workOrderId });
    if (press.arg === UsedArg.AS_PLANNED)
      return this.change(ctx, press, () =>
        this.deps.actions.submit({
          ...press,
          materialsUsed: { kind: MaterialsUsedKind.AS_PLANNED },
        }),
      );
    const card = await this.deps.mechanic.card(workOrderId);
    if (card?.notice.data.materials.length) {
      await ctx.answerCallbackQuery();
      return edit(ctx, materialsUsedScreen(ctx.t, card));
    }
    await this.change(ctx, press, () => this.deps.actions.submit(press));
  }

  private async pause(ctx: BotContext, press: Press): Promise<void> {
    const reason = press.arg === null ? undefined : WAIT_REASONS[Number(press.arg)];
    if (!reason) {
      await ctx.answerCallbackQuery();
      return edit(ctx, pauseScreen(ctx.t, press.workOrderId));
    }
    await this.change(ctx, press, () => this.deps.actions.pause({ ...press, reason }));
  }

  private async sendManual(ctx: BotContext, workOrderId: string): Promise<void> {
    const card = await this.deps.mechanic.card(workOrderId);
    const manual = card
      ? await this.deps.documents.manualFor(card.equipmentId, card.sourceDocumentId)
      : null;
    if (!manual) {
      await ctx.answerCallbackQuery({ text: ctx.t.maintenance.bot.noDocument, show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    // A manual kept as a public link is sent as its address; only presigned links stay out (C7).
    if (manual.kind === ManualKind.LINK) {
      const { title, url } = manual.link;
      await show(ctx, { text: format(ctx.t.maintenance.bot.manualLink, { title, url }) });
      return;
    }
    const file = manual.file;
    try {
      const document = file.telegramFileId ?? new InputFile(file.bytes, file.title + PDF_EXTENSION);
      const sent = await ctx.replyWithDocument(document);
      // Telegram keeps the upload; the next send reuses its file id instead of the bytes.
      if (!file.telegramFileId)
        await this.deps.documents.rememberTelegramFile(file.documentId, sent.document.file_id);
    } catch (error) {
      this.deps.logger.warn({ err: error, documentId: file.documentId }, 'manual send failed');
      await show(ctx, { text: ctx.t.maintenance.bot.documentFailed });
    }
  }

  /** Completes what the owed text was for. */
  completeText(ctx: BotContext, pending: TextPending, text: string): Promise<unknown> {
    const employeeId = ctx.employee?.id ?? '';
    const base = { employeeId, workOrderId: pending.workOrderId };
    switch (pending.step) {
      case PendingStep.MISSING:
        return this.missingText(base, pending.mask, text);
      case PendingStep.USED:
        return this.deps.actions.submit({
          ...base,
          materialsUsed: { kind: MaterialsUsedKind.OTHER, text },
        });
      case PendingStep.SUMMARY:
        return this.deps.actions.submit({ ...base, summary: { text } });
      case PendingStep.DECLINE:
        return this.deps.emergency.decline(employeeId, { ...base, reason: text });
      case PendingStep.REASON:
        return this.deps.actions.answer({ ...base, ...pending, reason: text });
    }
  }

  private async missingText(
    base: { readonly employeeId: string; readonly workOrderId: string },
    mask: number,
    text: string,
  ) {
    const card = await this.deps.mechanic.card(base.workOrderId);
    const note = card ? missingNote(card, mask, text) : text;
    return this.deps.actions.readiness({ ...base, ready: false, note });
  }

  /** Clears the owed input, runs it, explains a refusal and shows the card again. */
  async afterInput(ctx: BotContext, pending: Pending, run: () => Promise<unknown>) {
    await this.deps.store.del(this.key(ctx));
    try {
      await run();
      if (pending.step === PendingStep.DECLINE)
        return show(ctx, { text: ctx.t.maintenance.bot.declined });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      await show(ctx, { text: errorText(ctx.t, error) });
    }
    await show(ctx, await this.cardScreen(ctx, pending.workOrderId));
  }
}

/** Routes maintenance buttons, owed texts and operation photos; other updates pass through. */
export function maintenanceComposer(deps: MaintenanceBotDeps): Composer<BotContext> {
  const composer = new Composer<BotContext>();
  const bot = new MaintenanceBot(deps);

  composer.callbackQuery(/^mw:/, async (ctx) => {
    const callback = parseMaintenanceCallback(ctx.callbackQuery.data);
    const press = callback ? await bot.press(ctx, callback) : null;
    if (!callback || !press) {
      await ctx.answerCallbackQuery({ text: ctx.t.maintenance.bot.stateChanged });
      return;
    }
    await bot.handlers[callback.action](ctx, press);
  });

  composer.on('message:text', async (ctx, next) => {
    const pending = await bot.readPending(ctx);
    if (!pending || pending.step === PendingStep.PHOTO) return next();
    const text = ctx.message.text.trim().slice(0, TEXT_LIMIT);
    if (!text) return show(ctx, { text: ctx.t.maintenance.bot.errors.WORK_REASON_REQUIRED });
    await bot.afterInput(ctx, pending, () => bot.completeText(ctx, pending, text));
  });

  composer.on('message:photo', async (ctx, next) => {
    const pending = await bot.readPending(ctx);
    const photo = largestPhoto(ctx);
    if (pending?.step !== PendingStep.PHOTO || !photo) return next();
    const employeeId = ctx.employee?.id ?? '';
    await bot.afterInput(ctx, pending, () =>
      deps.actions.answer({
        employeeId,
        workOrderId: pending.workOrderId,
        ordinal: pending.ordinal,
        result: OperationResult.DONE,
        photo,
      }),
    );
  });

  return composer;
}
