import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  calendarFeedTokens,
  eq,
  gte,
  isNull,
  lte,
  orgUnits,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftTemplates,
  sites,
  type Database,
} from '@vakhta/db';
import { addMonths } from '@vakhta/domain';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';

/** Calendar clients poll; three hours keeps them close to publication without hammering the API. */
export const FEED_REFRESH = 'PT3H';

/**
 * Personal calendar feed (SC-44): a revocable token per employee that exposes only their own
 * published assignments as iCalendar events with a stable identity per person and business date.
 * Tokens are stored hashed and never logged; issuing a new one revokes the previous.
 */
@Injectable()
export class FeedService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
  ) {}

  /** Returns the plain token exactly once; the caller shows it to the employee in their chat. */
  async issue(employeeId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.transaction(async (tx) => {
      await tx
        .update(calendarFeedTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(calendarFeedTokens.employeeId, employeeId), isNull(calendarFeedTokens.revokedAt)),
        );
      await tx.insert(calendarFeedTokens).values({ employeeId, tokenHash: hash(token) });
      await this.events.append(tx, {
        type: 'CALENDAR_FEED_ISSUED',
        source: 'TELEGRAM',
        actor: { type: 'EMPLOYEE', id: employeeId, role: 'EMPLOYEE' },
        employeeId,
      });
      await this.audit.record(tx, {
        actor: { type: 'EMPLOYEE', id: employeeId, role: 'EMPLOYEE' },
        action: 'schedule.feed.issue',
        objectType: 'employee',
        objectId: employeeId,
      });
    });
    return token;
  }

  async revoke(employeeId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(calendarFeedTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(calendarFeedTokens.employeeId, employeeId), isNull(calendarFeedTokens.revokedAt)),
        )
        .returning({ id: calendarFeedTokens.id });
      if (rows.length > 0) {
        await this.events.append(tx, {
          type: 'CALENDAR_FEED_REVOKED',
          source: 'TELEGRAM',
          actor: { type: 'EMPLOYEE', id: employeeId, role: 'EMPLOYEE' },
          employeeId,
        });
        await this.audit.record(tx, {
          actor: { type: 'EMPLOYEE', id: employeeId, role: 'EMPLOYEE' },
          action: 'schedule.feed.revoke',
          objectType: 'employee',
          objectId: employeeId,
        });
      }
      return rows.length;
    });
  }

  async hasActive(employeeId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: calendarFeedTokens.id })
      .from(calendarFeedTokens)
      .where(
        and(eq(calendarFeedTokens.employeeId, employeeId), isNull(calendarFeedTokens.revokedAt)),
      )
      .limit(1);
    return !!row;
  }

  /** The employee behind a live token, or null; a revoked or unknown token is indistinguishable. */
  async resolve(token: string, now: Date = new Date()): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
    const [row] = await this.db
      .select({ id: calendarFeedTokens.id, employeeId: calendarFeedTokens.employeeId })
      .from(calendarFeedTokens)
      .where(
        and(eq(calendarFeedTokens.tokenHash, hash(token)), isNull(calendarFeedTokens.revokedAt)),
      );
    if (!row) return null;
    await this.db
      .update(calendarFeedTokens)
      .set({ lastUsedAt: now })
      .where(eq(calendarFeedTokens.id, row.id));
    return row.employeeId;
  }

  /** iCalendar text of the employee's own published assignments around the current month. */
  async ics(employeeId: string, now: Date = new Date()): Promise<string> {
    const month = now.toISOString().slice(0, 7);
    const from = `${addMonths(month, -1)}-01`;
    const to = `${addMonths(month, 2)}-01`;
    const rows = await this.db
      .select({
        employeeId: shiftAssignments.employeeId,
        businessDate: shiftAssignments.businessDate,
        planStartAt: shiftAssignments.planStartAt,
        planEndAt: shiftAssignments.planEndAt,
        isNight: shiftTemplates.isNight,
        zoneName: responsibilityZones.name,
        unitName: orgUnits.name,
        siteName: sites.name,
        publishedAt: scheduleVersions.publishedAt,
        versionNo: scheduleVersions.versionNo,
      })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(scheduleVersions.id, shiftAssignments.scheduleVersionId))
      .innerJoin(shiftTemplates, eq(shiftTemplates.id, shiftAssignments.templateId))
      .innerJoin(orgUnits, eq(orgUnits.id, shiftAssignments.orgUnitId))
      .innerJoin(sites, eq(sites.id, scheduleVersions.siteId))
      .leftJoin(responsibilityZones, eq(responsibilityZones.id, shiftAssignments.zoneId))
      .where(
        and(
          eq(shiftAssignments.employeeId, employeeId),
          eq(shiftAssignments.status, 'PLANNED'),
          eq(scheduleVersions.status, 'PUBLISHED'),
          gte(shiftAssignments.businessDate, from),
          lte(shiftAssignments.businessDate, to),
        ),
      )
      .orderBy(asc(shiftAssignments.planStartAt));
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Vakhta//Schedule//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Vakhta',
      `REFRESH-INTERVAL;VALUE=DURATION:${FEED_REFRESH}`,
      `X-PUBLISHED-TTL:${FEED_REFRESH}`,
    ];
    for (const row of rows) {
      const stamp = row.publishedAt ?? row.planStartAt;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${row.employeeId}-${row.businessDate}@vakhta`,
        `DTSTAMP:${stampOf(stamp)}`,
        `LAST-MODIFIED:${stampOf(stamp)}`,
        `SEQUENCE:${row.versionNo}`,
        `DTSTART:${stampOf(row.planStartAt)}`,
        `DTEND:${stampOf(row.planEndAt)}`,
        `SUMMARY:${escape(`${row.isNight ? 'Night' : 'Day'} shift${row.zoneName ? ` · ${row.zoneName}` : ''}`)}`,
        `DESCRIPTION:${escape(`${row.siteName} · ${row.unitName}`)}`,
        'END:VEVENT',
      );
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function stampOf(instant: Date): string {
  return instant
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function escape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** RFC 5545 line folding at 75 octets. */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (cut > 0 && Buffer.byteLength(rest.slice(0, cut)) > 75) cut -= 1;
    parts.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  parts.push(rest);
  return parts.join('\r\n');
}
