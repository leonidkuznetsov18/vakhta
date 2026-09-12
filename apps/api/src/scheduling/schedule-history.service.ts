import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  auditLog,
  authUser,
  desc,
  employees,
  eq,
  inArray,
  or,
  scheduleVersions,
  sql,
  type Database,
} from '@vakhta/db';
import {
  ScheduleHistoryPage,
  ScheduleStatusSchema,
  Uuid,
  type ScheduleHistoryEntry,
  type ScheduleHistoryQuery,
} from '@vakhta/contracts';
import { z } from 'zod';
import { DATABASE } from '../infra/database.module.js';
import { ScheduleService } from './schedule.service.js';

const HISTORY_ACTIONS = [
  'schedule.version.create',
  'schedule.assignments.replace',
  'schedule.version.submit',
  'schedule.version.return',
  'schedule.version.publish',
  'schedule.version.remind',
];
const StoredStatus = ScheduleStatusSchema.nullable().catch(null);
const StoredCount = z.number().int().nonnegative().nullable().catch(null);
const StoredVersionId = Uuid.nullable().catch(null);

type AuditRow = Pick<
  typeof auditLog.$inferSelect,
  'id' | 'at' | 'actorType' | 'actorId' | 'reason' | 'action' | 'before' | 'after'
>;

function historyEntry(row: AuditRow, actorLabel: string | null): ScheduleHistoryEntry {
  const identity = {
    id: row.id,
    at: row.at.toISOString(),
    actorType: row.actorType,
    actorId: row.actorId,
    actorLabel,
    reason: row.reason,
  };
  switch (row.action) {
    case 'schedule.version.create':
      return {
        ...identity,
        action: 'CREATE',
        basedOnVersionId: StoredVersionId.parse(row.after?.basedOn),
      };
    case 'schedule.assignments.replace':
      return { ...identity, action: 'SAVE', assignmentCount: StoredCount.parse(row.after?.count) };
    case 'schedule.version.submit':
    case 'schedule.version.return':
    case 'schedule.version.publish':
      return {
        ...identity,
        action:
          row.action === 'schedule.version.submit'
            ? 'SUBMIT'
            : row.action === 'schedule.version.return'
              ? 'RETURN'
              : 'PUBLISH',
        fromStatus: StoredStatus.parse(row.before?.status),
        toStatus: StoredStatus.parse(row.after?.status),
      };
    case 'schedule.version.remind':
      return {
        ...identity,
        action: 'REMIND',
        reminded: StoredCount.parse(row.after?.reminded),
        pending: StoredCount.parse(row.after?.pending),
      };
    default:
      throw new Error('Unsupported schedule history action');
  }
}

/** Narrow version history. The controller applies the same role/scope boundary as detail. */
@Injectable()
export class ScheduleHistoryService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly schedules: ScheduleService,
  ) {}

  async history(versionId: string, query: ScheduleHistoryQuery): Promise<ScheduleHistoryPage> {
    return this.db.transaction(
      async (tx) => {
        const version = await this.schedules.requireVersion(versionId, tx);
        const filter = and(
          eq(auditLog.objectType, 'schedule_version'),
          eq(auditLog.objectId, versionId),
          inArray(auditLog.action, HISTORY_ACTIONS),
        );
        const [count] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(auditLog)
          .where(filter);
        const rows = await tx
          .select({
            id: auditLog.id,
            at: auditLog.at,
            actorType: auditLog.actorType,
            actorId: auditLog.actorId,
            action: auditLog.action,
            reason: auditLog.reason,
            before: auditLog.before,
            after: auditLog.after,
            userLabel: authUser.email,
            employeeLabel: employees.fullName,
          })
          .from(auditLog)
          .leftJoin(
            authUser,
            and(eq(auditLog.actorType, 'WEB_USER'), eq(auditLog.actorId, authUser.id)),
          )
          .leftJoin(
            employees,
            and(eq(auditLog.actorType, 'EMPLOYEE'), eq(auditLog.actorId, employees.id)),
          )
          .where(filter)
          .orderBy(desc(auditLog.at), desc(auditLog.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize);
        const related = await tx
          .select({
            id: scheduleVersions.id,
            versionNo: scheduleVersions.versionNo,
            supersedesId: scheduleVersions.supersedesId,
          })
          .from(scheduleVersions)
          .where(
            and(
              eq(scheduleVersions.siteId, version.siteId),
              eq(scheduleVersions.orgUnitId, version.orgUnitId),
              eq(scheduleVersions.periodMonth, version.periodMonth),
              or(
                version.supersedesId ? eq(scheduleVersions.id, version.supersedesId) : undefined,
                eq(scheduleVersions.supersedesId, version.id),
              ),
            ),
          )
          .orderBy(desc(scheduleVersions.versionNo), desc(scheduleVersions.id));
        const reference = (row: (typeof related)[number] | undefined) =>
          row ? { id: row.id, versionNo: row.versionNo } : null;
        return ScheduleHistoryPage.parse({
          versionId,
          ...query,
          total: count?.total ?? 0,
          entries: rows.map((row) =>
            historyEntry(
              row,
              row.actorType === 'WEB_USER'
                ? row.userLabel
                : row.actorType === 'EMPLOYEE'
                  ? row.employeeLabel
                  : null,
            ),
          ),
          lineage: {
            supersedes: reference(related.find((row) => row.id === version.supersedesId)),
            supersededBy: reference(related.find((row) => row.supersedesId === version.id)),
          },
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
