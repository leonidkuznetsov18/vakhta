import { Global, Injectable, Module } from '@nestjs/common';
import { notificationOutbox, type DbOrTx } from '@vakhta/db';
import type { NotificationPayload, NotificationTemplate } from '@vakhta/domain';

export interface EnqueueInput {
  readonly recipientType: 'EMPLOYEE' | 'WEB_USER';
  readonly recipientId: string;
  readonly template: NotificationTemplate;
  readonly payload: NotificationPayload;
  /** Ідемпотентність доставки (FR-NTF-01): повтор із тим самим ключем не створює рядка. */
  readonly dedupeKey: string;
}

/** Постановка нотифікації в аутбокс у тій самій транзакції, що і подія (ADR-8). */
@Injectable()
export class NotificationsService {
  async enqueue(tx: DbOrTx, input: EnqueueInput): Promise<boolean> {
    const rows = await tx
      .insert(notificationOutbox)
      .values({
        recipientType: input.recipientType,
        recipientId: input.recipientId,
        template: input.template,
        payload: input.payload,
        dedupeKey: input.dedupeKey,
      })
      .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
      .returning({ id: notificationOutbox.id });
    return rows.length > 0;
  }
}

@Global()
@Module({ providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
