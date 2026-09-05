import { Injectable } from '@nestjs/common';
import { domainEvents, type DbOrTx, type eventSource } from '@vakhta/db';
import type { Actor } from '../common/actor.js';

export type EventSource = (typeof eventSource.enumValues)[number];

/** Обовʼязкові й необовʼязкові поля події за ТЗ 11.1. */
export interface AppendEventInput {
  readonly type: string;
  readonly source: EventSource;
  readonly actor: Actor;
  readonly occurredAt?: Date;
  readonly employeeId?: string | null;
  readonly shiftSessionId?: string | null;
  readonly zoneId?: string | null;
  readonly incidentId?: string | null;
  readonly reasonCode?: string | null;
  readonly comment?: string | null;
  readonly approvalId?: string | null;
  readonly telegramUpdateId?: number | null;
  readonly idempotencyKey?: string | null;
  readonly correctsEventId?: string | null;
  readonly scheduleVersionId?: string | null;
  readonly checklistVersionId?: string | null;
  readonly bonusRuleVersionId?: string | null;
  readonly payload?: Record<string, unknown>;
  readonly traceId?: string | null;
}

/**
 * Єдина точка запису в domain_events (ADR-1). Приймає транзакцію, щоб подія
 * комітилась разом зі зміною стану, а не окремо.
 */
@Injectable()
export class EventStore {
  async append(tx: DbOrTx, input: AppendEventInput): Promise<{ id: string }> {
    const [row] = await tx
      .insert(domainEvents)
      .values({
        type: input.type,
        occurredAt: input.occurredAt ?? new Date(),
        source: input.source,
        actorId: input.actor.id,
        actingRole: input.actor.role,
        employeeId: input.employeeId ?? null,
        shiftSessionId: input.shiftSessionId ?? null,
        zoneId: input.zoneId ?? null,
        incidentId: input.incidentId ?? null,
        reasonCode: input.reasonCode ?? null,
        comment: input.comment ?? null,
        approvalId: input.approvalId ?? null,
        telegramUpdateId: input.telegramUpdateId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        correctsEventId: input.correctsEventId ?? null,
        scheduleVersionId: input.scheduleVersionId ?? null,
        checklistVersionId: input.checklistVersionId ?? null,
        bonusRuleVersionId: input.bonusRuleVersionId ?? null,
        payload: input.payload ?? {},
        traceId: input.traceId ?? null,
      })
      .returning({ id: domainEvents.id });
    if (!row) throw new Error('domain_events: insert не повернув рядок');
    return row;
  }
}
