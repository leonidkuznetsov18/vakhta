import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  authUser,
  asc,
  desc,
  eq,
  inArray,
  sql,
  employees,
  orgUnits,
  webUserRoles,
  communications,
  communicationRecipients,
  communicationParts,
  communicationAttachments,
  telegramAccounts,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import {
  CreateCommunication,
  QuestionnaireDefinition,
  QuestionnaireAnswers,
  CommunicationDetail,
  CommunicationHistory,
  CommunicationDeliveryStatus,
  type CommunicationAudienceQuery,
} from '@vakhta/contracts';
import { type AccessScope } from '@vakhta/domain';
import { DATABASE } from '../infra/database.module.js';
import { type WebUser, webUserActor } from '../auth/web-auth.guard.js';
import { employeePlaceSql, scopeCondition } from '../common/access-scope.js';
import { DomainError } from '../common/domain-error.js';
import { isSerializationFailure, isUniqueViolation } from '../common/pg-errors.js';
import { AuditLog } from '../events/audit-log.js';
import { communicationScope } from './access.js';

const PAGE_SIZE = 30;
const invalid = () =>
  new DomainError(
    'COMMUNICATION_AUDIENCE_CHANGED',
    409,
    'Audience is no longer eligible; review again',
  );
function visibility(scope: AccessScope) {
  const permitted = scopeCondition(scope, employeePlaceSql(employees.id)) ?? sql`true`;
  return sql`not exists (select 1 from communication_recipients cr where cr.communication_id = ${communications.id}
    and cr.employee_id not in (select ${employees.id} from ${employees} where ${permitted}))`;
}

@Injectable()
export class CommunicationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
  ) {}

  async audience(user: WebUser, query: CommunicationAudienceQuery, allIds = false) {
    const scope = await communicationScope(this.db, user.id);
    const place = employeePlaceSql(employees.id);
    const search = query.search.replace(/[\\%_]/g, '\\$&');
    const where = and(
      scopeCondition(scope, place),
      search
        ? sql`(${employees.fullName} ilike ${`%${search}%`} or ${employees.personnelNumber} ilike ${`%${search}%`})`
        : undefined,
      query.siteId ? eq(place.site, query.siteId) : undefined,
      query.orgUnitId ? eq(place.unit, query.orgUnitId) : undefined,
      query.teamId ? eq(place.team, query.teamId) : undefined,
      allIds ? eq(employees.status, 'ACTIVE') : undefined,
      allIds
        ? sql`exists(select 1 from telegram_accounts t where t.employee_id = ${employees.id} and t.status = 'ACTIVE')`
        : undefined,
    );
    const [count] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(employees)
      .where(where);
    if (allIds && (count?.total ?? 0) > 500)
      throw new DomainError(
        'COMMUNICATION_AUDIENCE_LIMIT',
        400,
        'Narrow the audience to at most 500 employees',
      );
    const rows = await this.db
      .select({
        id: employees.id,
        fullName: employees.fullName,
        personnelNumber: employees.personnelNumber,
        status: employees.status,
        linked: sql<boolean>`exists(select 1 from telegram_accounts t where t.employee_id = ${employees.id} and t.status = 'ACTIVE')`,
        unitName: sql<
          string | null
        >`(select name from ${orgUnits} where ${orgUnits.id} = ${place.unit})`,
      })
      .from(employees)
      .where(where)
      .orderBy(asc(employees.fullName), asc(employees.id))
      .limit(allIds ? 500 : PAGE_SIZE)
      .offset(allIds ? 0 : (query.page - 1) * PAGE_SIZE);
    return {
      items: rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        personnelNumber: row.personnelNumber,
        unitName: row.unitName,
        eligible: row.status === 'ACTIVE' && row.linked,
        reason:
          row.status !== 'ACTIVE'
            ? ('INACTIVE' as const)
            : !row.linked
              ? ('UNLINKED' as const)
              : null,
      })),
      total: count?.total ?? 0,
      page: query.page,
    };
  }

  async create(user: WebUser, raw: CreateCommunication) {
    const command = CreateCommunication.parse(raw);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ ...command, recipientIds: [...command.recipientIds].sort() }))
      .digest('hex');
    const attempt = () =>
      this.db.transaction(
        async (tx) => {
          // Serialize the same actor/request even before the first campaign row exists.
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`${user.id}:${command.requestId}`}, 0))`,
          );
          const [existing] = await tx
            .select()
            .from(communications)
            .where(
              and(
                eq(communications.senderId, user.id),
                eq(communications.requestId, command.requestId),
              ),
            );
          if (existing) {
            if (existing.fingerprint !== fingerprint)
              throw new DomainError(
                'COMMUNICATION_REQUEST_CONFLICT',
                409,
                'Request identity has different content',
              );
            await this.requireVisible(tx, user, existing.id);
            return { id: existing.id };
          }
          await tx.select().from(webUserRoles).where(eq(webUserRoles.userId, user.id)).for('share');
          const scope = await communicationScope(tx, user.id);
          const audience = await tx
            .select()
            .from(employees)
            .where(
              and(
                inArray(employees.id, command.recipientIds),
                scopeCondition(scope, employeePlaceSql(employees.id)),
                eq(employees.status, 'ACTIVE'),
              ),
            )
            .for('share');
          if (audience.length !== command.recipientIds.length) throw invalid();
          const links = await tx
            .select()
            .from(telegramAccounts)
            .where(
              and(
                inArray(telegramAccounts.employeeId, command.recipientIds),
                eq(telegramAccounts.status, 'ACTIVE'),
              ),
            )
            .for('share');
          if (links.length !== audience.length) throw invalid();
          const attachments = command.attachmentIds.length
            ? await tx
                .select()
                .from(communicationAttachments)
                .where(inArray(communicationAttachments.id, command.attachmentIds))
                .for('update')
            : [];
          if (
            attachments.length !== command.attachmentIds.length ||
            attachments.some(
              (file) =>
                file.ownerId !== user.id ||
                file.communicationId ||
                file.status !== 'READY' ||
                file.expiresAt <= new Date(),
            )
          )
            throw new DomainError(
              'COMMUNICATION_ATTACHMENT_INVALID',
              409,
              'Attachment unavailable; upload again',
            );
          const id = randomUUID();
          await tx.insert(communications).values({
            id,
            senderId: user.id,
            requestId: command.requestId,
            fingerprint,
            body: command.text,
            questionnaire: command.questionnaire,
          });
          if (attachments.length)
            await tx
              .update(communicationAttachments)
              .set({ communicationId: id })
              .where(inArray(communicationAttachments.id, command.attachmentIds));
          for (const link of links) {
            const recipientId = randomUUID();
            await tx.insert(communicationRecipients).values({
              id: recipientId,
              communicationId: id,
              employeeId: link.employeeId,
              telegramAccountId: link.id,
              telegramUserId: link.telegramUserId,
            });
            const parts: Array<{ kind: string; payload: unknown }> = [];
            if (command.text) parts.push({ kind: 'TEXT', payload: { text: command.text } });
            for (const attachmentId of command.attachmentIds)
              parts.push({ kind: 'ATTACHMENT', payload: { attachmentId } });
            if (command.questionnaire)
              parts.push({
                kind: 'QUESTIONNAIRE',
                payload: { title: command.questionnaire.title, communicationId: id },
              });
            await tx
              .insert(communicationParts)
              .values(parts.map((part, ordinal) => ({ ...part, recipientId, ordinal })));
          }
          await this.audit.record(tx, {
            actor: webUserActor(user),
            action: 'communication.send',
            objectType: 'communication',
            objectId: id,
            after: {
              recipientCount: audience.length,
              attachmentCount: attachments.length,
              questionnaire: !!command.questionnaire,
            },
          });
          return { id };
        },
        { isolationLevel: 'serializable' },
      );
    for (let retry = 0; ; retry += 1) {
      try {
        return await attempt();
      } catch (error) {
        // A waiting duplicate must obtain a fresh serializable snapshot.
        if (retry >= 2 || (!isSerializationFailure(error) && !isUniqueViolation(error)))
          throw error;
      }
    }
  }

  async requireVisible(db: DbOrTx, user: WebUser, id: string) {
    const scope = await communicationScope(db, user.id);
    const [row] = await db
      .select()
      .from(communications)
      .where(
        and(eq(communications.id, id), eq(communications.senderId, user.id), visibility(scope)),
      );
    if (!row) throw new DomainError('COMMUNICATION_NOT_FOUND', 404, 'Communication is unavailable');
    return row;
  }

  async detail(user: WebUser, id: string, db: DbOrTx = this.db) {
    const row = await this.requireVisible(db, user, id);
    const recipients = await db
      .select({ recipient: communicationRecipients, fullName: employees.fullName })
      .from(communicationRecipients)
      .innerJoin(employees, eq(employees.id, communicationRecipients.employeeId))
      .where(eq(communicationRecipients.communicationId, id))
      .orderBy(asc(employees.fullName));
    const parts = recipients.length
      ? await db
          .select()
          .from(communicationParts)
          .where(
            inArray(
              communicationParts.recipientId,
              recipients.map((item) => item.recipient.id),
            ),
          )
          .orderBy(asc(communicationParts.ordinal))
      : [];
    const attachments = await db
      .select()
      .from(communicationAttachments)
      .where(eq(communicationAttachments.communicationId, id));
    const questionnaire = row.questionnaire
      ? QuestionnaireDefinition.parse(row.questionnaire)
      : null;
    const items = recipients.map(({ recipient, fullName }) => ({
      employeeId: recipient.employeeId,
      fullName,
      parts: parts
        .filter((part) => part.recipientId === recipient.id)
        .map((part) => ({
          id: part.id,
          ordinal: part.ordinal,
          status: CommunicationDeliveryStatus.parse(part.status),
        })),
      answers: QuestionnaireAnswers.parse(recipient.answers),
      startedAt: recipient.startedAt?.toISOString() ?? null,
      submittedAt: recipient.submittedAt?.toISOString() ?? null,
    }));
    const [sender] = await db
      .select({ name: authUser.name })
      .from(authUser)
      .where(eq(authUser.id, row.senderId));
    return CommunicationDetail.parse({
      senderName: sender?.name ?? '',
      id,
      text: row.body,
      title: questionnaire?.title ?? null,
      createdAt: row.createdAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      recipientCount: items.length,
      sentCount: items.filter((item) => item.parts.every((part) => part.status === 'SENT')).length,
      failedCount: items.filter((item) =>
        item.parts.some((part) => ['FAILED', 'SKIPPED', 'UNKNOWN'].includes(part.status)),
      ).length,
      startedCount: items.filter((item) => item.startedAt).length,
      submittedCount: items.filter((item) => item.submittedAt).length,
      questionnaire,
      attachments,
      recipients: items,
    });
  }

  async history(user: WebUser, page: number) {
    return this.db.transaction(
      async (tx) => {
        const scope = await communicationScope(tx, user.id);
        const where = and(eq(communications.senderId, user.id), visibility(scope));
        const [count] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(communications)
          .where(where);
        const rows = await tx
          .select({ id: communications.id })
          .from(communications)
          .where(where)
          .orderBy(desc(communications.createdAt))
          .limit(10)
          .offset((page - 1) * 10);
        const items = [];
        for (const row of rows) items.push(await this.detail(user, row.id, tx));
        return CommunicationHistory.parse({ items, total: count?.total ?? 0, page });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async close(user: WebUser, id: string) {
    return this.db.transaction(async (tx) => {
      await tx.select().from(communications).where(eq(communications.id, id)).for('update');
      const row = await this.requireVisible(tx, user, id);
      if (!row.questionnaire)
        throw new DomainError('QUESTIONNAIRE_NOT_FOUND', 404, 'Questionnaire unavailable');
      if (!row.closedAt) {
        await tx
          .update(communications)
          .set({ closedAt: new Date() })
          .where(eq(communications.id, id));
        await this.audit.record(tx, {
          actor: webUserActor(user),
          action: 'questionnaire.close',
          objectType: 'communication',
          objectId: id,
        });
      }
      return { id };
    });
  }

  async retry(user: WebUser, id: string, partId: string) {
    await this.db.transaction(async (tx) => {
      await this.requireVisible(tx, user, id);
      const [part] = await tx
        .select({ part: communicationParts })
        .from(communicationParts)
        .innerJoin(
          communicationRecipients,
          eq(communicationRecipients.id, communicationParts.recipientId),
        )
        .where(
          and(eq(communicationParts.id, partId), eq(communicationRecipients.communicationId, id)),
        )
        .for('update');
      if (!part || !['FAILED', 'UNKNOWN'].includes(part.part.status))
        throw new DomainError('COMMUNICATION_RETRY_UNAVAILABLE', 409, 'Delivery cannot be retried');
      await tx
        .update(communicationParts)
        .set({
          status: 'PENDING',
          attempts: 0,
          nextAttemptAt: new Date(),
          claimId: null,
          leaseUntil: null,
        })
        .where(eq(communicationParts.id, partId));
      await this.audit.record(tx, {
        actor: webUserActor(user),
        action: 'communication.retry',
        objectType: 'communication',
        objectId: id,
        after: { partId, previousStatus: part.part.status },
      });
    });
    return { id };
  }
}
