import { Injectable } from '@nestjs/common';
import { auditLog, type DbOrTx } from '@vakhta/db';
import type { Actor } from '../common/actor.js';

export interface AuditEntry {
  readonly actor: Actor;
  /** 'employee.create', 'employee.telegram.relink' тощо: обʼєкт.дія. */
  readonly action: string;
  readonly objectType: string;
  readonly objectId?: string | null;
  readonly before?: Record<string, unknown> | null;
  readonly after?: Record<string, unknown> | null;
  readonly reason?: string | null;
  readonly ip?: string | null;
  readonly traceId?: string | null;
}

/** Незмінний аудит ручних дій, входів, переглядів і вивантажень (ТЗ 13, FR-WEB-05). */
@Injectable()
export class AuditLog {
  async record(tx: DbOrTx, entry: AuditEntry): Promise<void> {
    await tx.insert(auditLog).values({
      actorId: entry.actor.id,
      actorType: entry.actor.type,
      action: entry.action,
      objectType: entry.objectType,
      objectId: entry.objectId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      reason: entry.reason ?? (entry.actor.label ? `via ${entry.actor.label}` : null),
      ip: entry.ip ?? null,
      traceId: entry.traceId ?? null,
    });
  }
}
