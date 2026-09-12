import { Api, GrammyError, HttpError, InlineKeyboard } from 'grammy';
import {
  and,
  asc,
  eq,
  lte,
  notificationOutbox,
  sql,
  telegramAccounts,
  type Database,
} from '@vakhta/db';
import type { NotificationPayload } from '@vakhta/domain';
import { ShiftReminderJob } from '@vakhta/contracts';
import { ackReminderTarget, readAckReminder } from '../timers/ack-reminder-policy.js';
import { readShiftReminder } from '../timers/shift-reminder-policy.js';
import { timerNow } from '../timers/time.js';

/** Помилка доставки з рішенням: повторити пізніше або відкласти назавжди. */
export class SendError extends Error {
  constructor(
    readonly kind: 'RETRY' | 'SKIP',
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'SendError';
  }
}

export interface OutboxSender {
  send(chatId: number, payload: NotificationPayload): Promise<{ messageId: number | null }>;
}

/** Реальний відправник: grammY Api. 403 і «chat not found» не повторюються, 429 чекає retry_after. */
export class TelegramSender implements OutboxSender {
  constructor(private readonly api: Api) {}

  static fromToken(token: string): TelegramSender {
    return new TelegramSender(new Api(token));
  }

  async send(chatId: number, payload: NotificationPayload): Promise<{ messageId: number | null }> {
    let replyMarkup: InlineKeyboard | undefined;
    if (payload.buttons && payload.buttons.length > 0) {
      replyMarkup = new InlineKeyboard();
      payload.buttons.forEach((row, i) => {
        if (i > 0) replyMarkup!.row();
        for (const b of row) replyMarkup!.text(b.text, b.callbackData);
      });
    }
    try {
      const message = await this.api.sendMessage(chatId, payload.text, {
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      return { messageId: message.message_id };
    } catch (error) {
      if (error instanceof GrammyError) {
        if (error.error_code === 403)
          throw new SendError('SKIP', `бот заблокований: ${error.description}`);
        if (error.error_code === 400 && /chat not found/i.test(error.description)) {
          throw new SendError('SKIP', error.description);
        }
        if (error.error_code === 429) {
          throw new SendError('RETRY', error.description, error.parameters.retry_after ?? 30);
        }
        throw new SendError('RETRY', `${error.error_code}: ${error.description}`);
      }
      if (error instanceof HttpError) throw new SendError('RETRY', `мережа: ${error.message}`);
      throw new SendError('RETRY', error instanceof Error ? error.message : String(error));
    }
  }
}

export interface RelayOptions {
  readonly batch?: number;
  readonly maxAttempts?: number;
  readonly now?: () => Date;
}

export interface RelayResult {
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
  deferred: number;
}

/** Експоненційна затримка: 30 с, 60 с, 120 с … не більше години. */
export function backoffSeconds(attempt: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
}

/**
 * Один прохід релею (ADR-8): забирає PENDING через SKIP LOCKED, шле, оновлює статус.
 * Кілька інстансів воркера не надішлють один рядок двічі: рядки заблоковані до коміту.
 */
export async function relayOnce(
  db: Database,
  sender: OutboxSender,
  options: RelayOptions = {},
): Promise<RelayResult> {
  const batch = options.batch ?? 20;
  const maxAttempts = options.maxAttempts ?? 10;
  const now = options.now ?? (() => new Date());
  // Без явного годинника «зараз» береться з бази: годинники застосунку і Postgres можуть розходитись.
  const dueBefore = options.now ? now() : sql`now()`;
  const result: RelayResult = { sent: 0, skipped: 0, failed: 0, retried: 0, deferred: 0 };

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.status, 'PENDING'),
          lte(notificationOutbox.nextAttemptAt, dueBefore),
        ),
      )
      .orderBy(asc(notificationOutbox.nextAttemptAt))
      .limit(batch)
      .for('update', { skipLocked: true });

    for (const row of rows) {
      const skip = async (reason: string) => {
        await tx
          .update(notificationOutbox)
          .set({ status: 'SKIPPED', lastError: reason })
          .where(eq(notificationOutbox.id, row.id));
        result.skipped += 1;
      };

      if (row.recipientType !== 'EMPLOYEE') {
        await skip(`канал для ${row.recipientType} не підтримується`);
        continue;
      }
      const [link] = await tx
        .select({ telegramUserId: telegramAccounts.telegramUserId })
        .from(telegramAccounts)
        .where(
          and(
            eq(telegramAccounts.employeeId, row.recipientId),
            eq(telegramAccounts.status, 'ACTIVE'),
          ),
        )
        .limit(1);
      if (!link) {
        await skip('немає активної привʼязки Telegram');
        continue;
      }

      let payload = row.payload;
      if (row.template === 'SHIFT_REMINDER') {
        const prefix = 'shift-reminder:';
        const id = ShiftReminderJob.shape.assignmentId.safeParse(
          row.dedupeKey.startsWith(prefix) ? row.dedupeKey.slice(prefix.length) : null,
        );
        const deliveryTime = await timerNow(tx, options.now?.());
        const reminder = id.success ? await readShiftReminder(tx, id.data, deliveryTime) : null;
        if (!reminder || reminder.employeeId !== row.recipientId) {
          await skip('Shift reminder is no longer applicable');
          continue;
        }
        // Old timers/outbox entries may predate the 30-minute policy. Defer without using a retry.
        if (reminder.sendAt > deliveryTime) {
          await tx
            .update(notificationOutbox)
            .set({ nextAttemptAt: reminder.sendAt })
            .where(eq(notificationOutbox.id, row.id));
          result.deferred += 1;
          continue;
        }
        payload = reminder.payload;
      }

      if (row.template === 'ACK_REMINDER') {
        const target = ackReminderTarget(row.dedupeKey);
        const deliveryTime = await timerNow(tx, options.now?.());
        const reminder =
          target && target.employeeId === row.recipientId
            ? await readAckReminder(tx, target, deliveryTime)
            : null;
        if (!reminder) {
          await skip('Acknowledgement reminder is no longer applicable');
          continue;
        }
        payload = reminder;
      }

      try {
        const { messageId } = await sender.send(link.telegramUserId, payload);
        await tx
          .update(notificationOutbox)
          .set({
            status: 'SENT',
            sentAt: now(),
            telegramMessageId: messageId,
            attempts: row.attempts + 1,
            lastError: null,
            payload,
          })
          .where(eq(notificationOutbox.id, row.id));
        result.sent += 1;
      } catch (error) {
        const err = error instanceof SendError ? error : new SendError('RETRY', String(error));
        if (err.kind === 'SKIP') {
          await skip(err.message);
          continue;
        }
        const attempts = row.attempts + 1;
        if (attempts >= maxAttempts) {
          await tx
            .update(notificationOutbox)
            .set({ status: 'FAILED', attempts, lastError: err.message })
            .where(eq(notificationOutbox.id, row.id));
          result.failed += 1;
        } else {
          const delay = err.retryAfterSeconds ?? backoffSeconds(attempts);
          await tx
            .update(notificationOutbox)
            .set({
              attempts,
              lastError: err.message,
              nextAttemptAt: new Date(now().getTime() + delay * 1000),
            })
            .where(eq(notificationOutbox.id, row.id));
          result.retried += 1;
        }
      }
    }
  });

  return result;
}
