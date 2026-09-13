import { createHash, randomUUID } from 'node:crypto';
import { Api, GrammyError, InputFile } from 'grammy';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';
import {
  and,
  asc,
  communications,
  communicationRecipients,
  communicationParts,
  communicationAttachments,
  employees,
  employeePositions,
  orgUnits,
  telegramAccounts,
  webUserRoles,
  eq,
  gt,
  isNull,
  lte,
  or,
  sql,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import { grantCovers } from '@vakhta/domain';
import { format, messages } from '@vakhta/i18n';
import type { WorkerEnv } from '../env.js';

export interface CommunicationTransport {
  send(
    chatId: number,
    part: {
      kind: string;
      text: string;
      file?: { bytes: Uint8Array; filename: string; contentType: string };
      url?: string;
      button?: string;
    },
  ): Promise<number>;
}
export interface CommunicationFileReader {
  read(key: string, size: number, sha256: string): Promise<Uint8Array>;
}
export class TelegramCommunicationTransport implements CommunicationTransport {
  constructor(private readonly api: Api) {}
  static fromToken(token: string) {
    return new TelegramCommunicationTransport(new Api(token, { timeoutSeconds: 45 }));
  }
  async send(chatId: number, part: Parameters<CommunicationTransport['send']>[1]) {
    if (part.file) {
      const input = new InputFile(part.file.bytes, part.file.filename);
      const message = part.file.contentType.startsWith('image/')
        ? await this.api.sendPhoto(chatId, input)
        : part.file.contentType.startsWith('video/')
          ? await this.api.sendVideo(chatId, input)
          : part.file.contentType.startsWith('audio/')
            ? await this.api.sendAudio(chatId, input)
            : await this.api.sendDocument(chatId, input);
      return message.message_id;
    }
    const message = await this.api.sendMessage(
      chatId,
      part.text,
      part.url && part.button
        ? {
            reply_markup: {
              inline_keyboard: [[{ text: part.button, web_app: { url: part.url } }]],
            },
          }
        : {},
    );
    return message.message_id;
  }
}
export class PrivateCommunicationFiles implements CommunicationFileReader {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}
  static fromEnv(env: WorkerEnv): PrivateCommunicationFiles | null {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) return null;
    return new PrivateCommunicationFiles(
      new S3Client({
        region: env.S3_REGION,
        ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
      }),
      env.S3_BUCKET,
    );
  }
  async read(key: string, size: number, sha256: string) {
    if (size < 1 || size > 10 * 1024 * 1024) throw new Error('Invalid stored attachment size');
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(15_000),
    });
    if (object.ContentLength !== size || !object.Body) throw new Error('Attachment size mismatch');
    const bytes = await object.Body.transformToByteArray();
    if (bytes.length !== size || createHash('sha256').update(bytes).digest('hex') !== sha256)
      throw new Error('Attachment integrity mismatch');
    return bytes;
  }
}
async function eligible(
  db: DbOrTx,
  recipient: typeof communicationRecipients.$inferSelect,
  senderId: string,
) {
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, recipient.employeeId), eq(employees.status, 'ACTIVE')));
  const [link] = await db
    .select()
    .from(telegramAccounts)
    .where(
      and(
        eq(telegramAccounts.id, recipient.telegramAccountId),
        eq(telegramAccounts.employeeId, recipient.employeeId),
        eq(telegramAccounts.telegramUserId, recipient.telegramUserId),
        eq(telegramAccounts.status, 'ACTIVE'),
      ),
    );
  if (!employee || !link) return null;
  const grants = await db.select().from(webUserRoles).where(eq(webUserRoles.userId, senderId));
  const now = new Date();
  const [position] = await db
    .select({
      siteId: orgUnits.siteId,
      orgUnitId: employeePositions.orgUnitId,
      teamId: employeePositions.teamId,
    })
    .from(employeePositions)
    .innerJoin(orgUnits, eq(orgUnits.id, employeePositions.orgUnitId))
    .where(
      and(
        eq(employeePositions.employeeId, recipient.employeeId),
        lte(employeePositions.validFrom, now),
        or(isNull(employeePositions.validTo), gt(employeePositions.validTo, now)),
      ),
    )
    .orderBy(sql`${employeePositions.validFrom} desc`)
    .limit(1);
  const permitted = grants.some(
    (grant) =>
      ['ADMIN', 'HR', 'PRODUCTION_HEAD', 'SHIFT_MASTER'].includes(grant.role) &&
      (position
        ? grantCovers(grant, {
            siteId: position.siteId,
            orgUnitId: position.orgUnitId,
            ...(position.teamId ? { teamId: position.teamId } : {}),
          })
        : grant.scopeType === 'ENTERPRISE'),
  );
  return permitted ? employee : null;
}

/** One leased part, network outside the transaction; uncertain sends require explicit reconciliation. */
export async function dispatchCommunication(
  db: Database,
  transport: CommunicationTransport,
  files: CommunicationFileReader | null,
  webUrl: string,
  now = new Date(),
) {
  await db
    .update(communicationParts)
    .set({
      status: 'UNKNOWN',
      lastError: 'Delivery lease expired; outcome unknown',
      claimId: null,
      leaseUntil: null,
    })
    .where(and(eq(communicationParts.status, 'SENDING'), lte(communicationParts.leaseUntil, now)));
  const claimed = await db.transaction(async (tx) => {
    const [part] = await tx
      .select()
      .from(communicationParts)
      .where(
        and(
          eq(communicationParts.status, 'PENDING'),
          lte(communicationParts.nextAttemptAt, now),
          sql`not exists(select 1 from communication_parts previous where previous.recipient_id = ${communicationParts.recipientId} and previous.ordinal < ${communicationParts.ordinal} and previous.status <> 'SENT')`,
        ),
      )
      .orderBy(asc(communicationParts.nextAttemptAt), asc(communicationParts.ordinal))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!part) return null;
    const claimId = randomUUID();
    await tx
      .update(communicationParts)
      .set({
        status: 'SENDING',
        claimId,
        leaseUntil: new Date(now.getTime() + 90_000),
        attempts: part.attempts + 1,
      })
      .where(eq(communicationParts.id, part.id));
    return { ...part, claimId };
  });
  if (!claimed) return false;
  const finish = (values: Partial<typeof communicationParts.$inferInsert>) =>
    db
      .update(communicationParts)
      .set({ ...values, claimId: null, leaseUntil: null })
      .where(
        and(
          eq(communicationParts.id, claimed.id),
          eq(communicationParts.claimId, claimed.claimId),
          eq(communicationParts.status, 'SENDING'),
        ),
      );
  const cancelRemaining = async () => {
    await db
      .update(communicationParts)
      .set({
        status: 'SKIPPED',
        lastError: 'Delivery cancelled after an unavailable predecessor',
      })
      .where(
        and(
          eq(communicationParts.recipientId, claimed.recipientId),
          eq(communicationParts.status, 'PENDING'),
        ),
      );
  };
  let sending = false;
  try {
    const [row] = await db
      .select({ recipient: communicationRecipients, campaign: communications })
      .from(communicationRecipients)
      .innerJoin(communications, eq(communications.id, communicationRecipients.communicationId))
      .where(eq(communicationRecipients.id, claimed.recipientId));
    const employee = row ? await eligible(db, row.recipient, row.campaign.senderId) : null;
    if (!row || !employee || (claimed.kind === 'QUESTIONNAIRE' && row.campaign.closedAt)) {
      await finish({
        status: 'SKIPPED',
        lastError: 'Recipient binding, authority or questionnaire changed',
      });
      await cancelRemaining();
      return true;
    }
    const t = messages(employee.locale ?? 'ru');
    let outgoing: Parameters<CommunicationTransport['send']>[1] = { kind: claimed.kind, text: '' };
    if (claimed.kind === 'TEXT')
      outgoing.text = format(
        t.shift.masterMessage,
        z.object({ text: z.string().max(1000) }).parse(claimed.payload),
      );
    else if (claimed.kind === 'ATTACHMENT') {
      const payload = z.object({ attachmentId: z.uuid() }).parse(claimed.payload);
      const [file] = await db
        .select()
        .from(communicationAttachments)
        .where(
          and(
            eq(communicationAttachments.id, payload.attachmentId),
            eq(communicationAttachments.communicationId, row.campaign.id),
            eq(communicationAttachments.status, 'READY'),
          ),
        );
      if (!file || !files) throw new Error('Attachment storage unavailable');
      outgoing.file = {
        bytes: await files.read(file.storageKey, file.sizeBytes, file.sha256),
        filename: file.filename,
        contentType: file.contentType,
      };
    } else if (claimed.kind === 'QUESTIONNAIRE') {
      const payload = z
        .object({ title: z.string(), communicationId: z.uuid() })
        .parse(claimed.payload);
      const url = new URL(webUrl);
      if (url.protocol !== 'https:') throw new Error('Questionnaire requires HTTPS');
      url.searchParams.set('questionnaire', payload.communicationId);
      outgoing = {
        kind: claimed.kind,
        text: format(t.communications.invitation, { title: payload.title }),
        url: url.toString(),
        button: t.communications.openQuestionnaire,
      };
    } else throw new Error('Unknown delivery kind');
    // Upload preparation can outlive a relink; recheck immediately before transmitting.
    if (!(await eligible(db, row.recipient, row.campaign.senderId))) {
      await finish({ status: 'SKIPPED', lastError: 'Recipient authority changed' });
      await cancelRemaining();
      return true;
    }
    const [fenced] = await db
      .update(communicationParts)
      .set({ leaseUntil: new Date(Date.now() + 90_000) })
      .where(
        and(
          eq(communicationParts.id, claimed.id),
          eq(communicationParts.claimId, claimed.claimId),
          eq(communicationParts.status, 'SENDING'),
          gt(communicationParts.leaseUntil, new Date()),
        ),
      )
      .returning({ id: communicationParts.id });
    if (!fenced) return true;
    sending = true;
    const messageId = await transport.send(row.recipient.telegramUserId, outgoing);
    await finish({
      status: 'SENT',
      telegramMessageId: messageId,
      sentAt: new Date(),
      lastError: null,
    });
  } catch (error) {
    if (error instanceof GrammyError && error.error_code === 429) {
      const delay = error.parameters.retry_after ?? 30;
      await finish({
        status: claimed.attempts >= 9 ? 'FAILED' : 'PENDING',
        nextAttemptAt: new Date(Date.now() + delay * 1000),
        lastError: 'Telegram rate limit',
      });
    } else if (error instanceof GrammyError && [400, 403].includes(error.error_code)) {
      await finish({
        status: error.error_code === 403 ? 'SKIPPED' : 'FAILED',
        lastError: `Telegram rejected delivery (${error.error_code})`,
      });
      if (error.error_code === 403) await cancelRemaining();
    } else if (sending) {
      await finish({
        status: 'UNKNOWN',
        lastError: 'Transport outcome unknown; explicit retry required',
      });
    } else {
      await finish({
        status: claimed.attempts >= 4 ? 'FAILED' : 'PENDING',
        nextAttemptAt: new Date(Date.now() + 30_000 * 2 ** claimed.attempts),
        lastError: 'Attachment preparation failed',
      });
    }
  }
  return true;
}
