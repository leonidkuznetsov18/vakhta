import { Injectable, Inject } from '@nestjs/common';
import {
  and,
  auditLog,
  desc,
  domainEvents,
  employees,
  eq,
  gte,
  inArray,
  like,
  lte,
  authUser,
  type Database,
} from '@vakhta/db';
import type { AuditEntryView, AuditQuery, DomainEventView, EventsQuery } from '@vakhta/contracts';
import { DATABASE } from '../infra/database.module.js';

@Injectable()
export class ReportsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * The six table reports were removed on 2026-09-09: they were six equal tabs with no guidance on
   * which to open, and the one question the product exists for — where the time goes — none of them
   * answered. `LossesService` answers it; what stays here is the audit trail.
   */

  async auditEntries(q: AuditQuery): Promise<AuditEntryView[]> {
    const conditions = [];
    if (q.from) conditions.push(gte(auditLog.at, new Date(q.from)));
    if (q.to) conditions.push(lte(auditLog.at, new Date(q.to)));
    if (q.actorId) conditions.push(eq(auditLog.actorId, q.actorId));
    if (q.action) conditions.push(like(auditLog.action, `%${q.action}%`));
    if (q.objectType) conditions.push(eq(auditLog.objectType, q.objectType));
    if (q.objectId) conditions.push(eq(auditLog.objectId, q.objectId));
    const rows = await this.db
      .select()
      .from(auditLog)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.at))
      .limit(q.limit ?? 200);
    const names = await this.actorNames(rows);
    return rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      actorType: r.actorType,
      actorId: r.actorId,
      actorName: r.actorId ? (names.get(`${r.actorType}:${r.actorId}`) ?? null) : null,
      action: r.action,
      objectType: r.objectType,
      objectId: r.objectId,
      before: r.before,
      after: r.after,
      reason: r.reason,
    }));
  }

  /** Panel users by email, employees by full name; other actor types stay as their id. */
  private async actorNames(
    rows: readonly { actorType: string; actorId: string | null }[],
  ): Promise<Map<string, string>> {
    const ids = (type: string) => [
      ...new Set(
        rows.filter((r) => r.actorType === type && r.actorId).map((r) => r.actorId as string),
      ),
    ];
    const userIds = ids('WEB_USER');
    const employeeIds = ids('EMPLOYEE');
    const [users, people] = await Promise.all([
      userIds.length
        ? this.db
            .select({ id: authUser.id, email: authUser.email })
            .from(authUser)
            .where(inArray(authUser.id, userIds))
        : [],
      employeeIds.length
        ? this.db
            .select({ id: employees.id, fullName: employees.fullName })
            .from(employees)
            .where(inArray(employees.id, employeeIds))
        : [],
    ]);
    const names = new Map<string, string>();
    for (const u of users) names.set(`WEB_USER:${u.id}`, u.email);
    for (const p of people) names.set(`EMPLOYEE:${p.id}`, p.fullName);
    return names;
  }

  async events(q: EventsQuery): Promise<DomainEventView[]> {
    const conditions = [];
    if (q.from) conditions.push(gte(domainEvents.occurredAt, new Date(q.from)));
    if (q.to) conditions.push(lte(domainEvents.occurredAt, new Date(q.to)));
    if (q.employeeId) conditions.push(eq(domainEvents.employeeId, q.employeeId));
    if (q.shiftSessionId) conditions.push(eq(domainEvents.shiftSessionId, q.shiftSessionId));
    if (q.type) conditions.push(like(domainEvents.type, `%${q.type}%`));
    const rows = await this.db
      .select({ e: domainEvents, employeeName: employees.fullName })
      .from(domainEvents)
      .leftJoin(employees, eq(domainEvents.employeeId, employees.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(domainEvents.occurredAt))
      .limit(q.limit ?? 200);
    return rows.map(({ e, employeeName }) => ({
      id: e.id,
      type: e.type,
      occurredAt: e.occurredAt.toISOString(),
      receivedAt: e.receivedAt.toISOString(),
      source: e.source,
      actorId: e.actorId,
      actingRole: e.actingRole,
      employeeId: e.employeeId,
      employeeName,
      shiftSessionId: e.shiftSessionId,
      reasonCode: e.reasonCode,
      comment: e.comment,
      correctsEventId: e.correctsEventId,
      payload: e.payload,
    }));
  }
}
