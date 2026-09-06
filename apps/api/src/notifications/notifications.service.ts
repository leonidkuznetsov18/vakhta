import { Global, Injectable, Module } from '@nestjs/common';
import { employeeLocale, notificationOutbox, type DbOrTx } from '@vakhta/db';
import { DEFAULT_LOCALE } from '@vakhta/domain';
import type { NotificationPayload, NotificationTemplate } from '@vakhta/domain';
import { messages, type Messages } from '@vakhta/i18n';

export interface EnqueueInput {
  readonly recipientType: 'EMPLOYEE' | 'WEB_USER';
  readonly recipientId: string;
  readonly template: NotificationTemplate;
  /**
   * Rendered payload, or a renderer that receives the catalog in the recipient's language.
   * Prefer the renderer: the text is stored already localized, so the relay stays dumb.
   */
  readonly payload: NotificationPayload | ((t: Messages) => NotificationPayload);
  /** Delivery idempotency (FR-NTF-01): a repeat with the same key does not create a row. */
  readonly dedupeKey: string;
}

/** Puts a notification into the outbox in the same transaction as the event (ADR-8). */
@Injectable()
export class NotificationsService {
  async enqueue(tx: DbOrTx, input: EnqueueInput): Promise<boolean> {
    const payload =
      typeof input.payload === 'function'
        ? input.payload(messages(await this.localeOf(tx, input)))
        : input.payload;
    const rows = await tx
      .insert(notificationOutbox)
      .values({
        recipientType: input.recipientType,
        recipientId: input.recipientId,
        template: input.template,
        payload,
        dedupeKey: input.dedupeKey,
      })
      .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
      .returning({ id: notificationOutbox.id });
    return rows.length > 0;
  }

  private localeOf(tx: DbOrTx, input: EnqueueInput) {
    return input.recipientType === 'EMPLOYEE'
      ? employeeLocale(tx, input.recipientId)
      : Promise.resolve(DEFAULT_LOCALE);
  }
}

@Global()
@Module({ providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
