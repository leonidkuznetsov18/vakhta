import { Inject, Injectable } from '@nestjs/common';
import {
  controlAuditLog,
  desc,
  eq,
  type RegistryDbOrTx,
  type RegistryDatabase,
} from '@vakhta/registry';
import type { ControlAuditEntryView } from '@vakhta/contracts';
import { REGISTRY } from '../infra/registry.module.js';
import type { Operator } from '../auth/operator.guard.js';

export interface AuditEntry {
  readonly actor: Operator | null;
  readonly action: string;
  readonly tenantId: string | null;
  readonly objectType: string;
  readonly objectId: string | null;
  readonly before?: Record<string, unknown> | null;
  readonly after?: Record<string, unknown> | null;
}

/** Append-only (C6). Callers pass redacted values: never a token, URL or password. */
@Injectable()
export class ControlAudit {
  constructor(@Inject(REGISTRY) private readonly db: RegistryDatabase) {}

  async record(tx: RegistryDbOrTx, entry: AuditEntry): Promise<void> {
    await tx.insert(controlAuditLog).values({
      actorId: entry.actor?.id ?? null,
      actorEmail: entry.actor?.email ?? null,
      action: entry.action,
      tenantId: entry.tenantId,
      objectType: entry.objectType,
      objectId: entry.objectId,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  }

  async list(tenantId: string | null, limit = 100): Promise<ControlAuditEntryView[]> {
    const rows = await this.db
      .select()
      .from(controlAuditLog)
      .where(tenantId ? eq(controlAuditLog.tenantId, tenantId) : undefined)
      .orderBy(desc(controlAuditLog.at))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      actorEmail: r.actorEmail,
      action: r.action,
      tenantId: r.tenantId,
      objectType: r.objectType,
      objectId: r.objectId,
      before: r.before ?? null,
      after: r.after ?? null,
    }));
  }
}
