import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import {
  and,
  asc,
  authUser,
  desc,
  eq,
  equipment,
  equipmentDocumentLinks,
  equipmentDocuments,
  inArray,
  isNull,
  sql,
  type Database,
} from '@vakhta/db';
import type {
  DocumentLinkView,
  DocumentUploadQuery,
  EquipmentDocumentView,
  LibraryDocumentView,
} from '@vakhta/contracts';
import { EquipmentDocumentKind } from '@vakhta/domain';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { textOrNull } from '../common/text.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../infra/object-storage.js';
import { currentStoragePrefix } from '../infra/tenant-context.js';

/** Manuals are PDFs up to Telegram's bot upload limit (spec A-6). */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const LINK_TTL_SECONDS = 300;

/** Only a real, non-empty PDF within the limit is stored (FR-009). */
export async function assertPdf(bytes: Buffer): Promise<void> {
  if (bytes.length > MAX_DOCUMENT_BYTES)
    throw new DomainError('DOCUMENT_TOO_LARGE', 413, 'Document exceeds 50 MiB');
  if (!bytes.length || bytes.toString('ascii', 0, 5) !== '%PDF-')
    throw new DomainError('DOCUMENT_INVALID', 400, 'A PDF file is required');
  try {
    const document = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    if (!document.getPageCount()) throw new Error('Empty PDF');
  } catch {
    throw new DomainError('DOCUMENT_INVALID', 400, 'PDF cannot be parsed');
  }
}

/** A manual to send: Telegram's cached file when it has one, the stored bytes otherwise. */
export type StoredDocument = { readonly title: string; readonly documentId: string } & (
  | { readonly telegramFileId: string; readonly bytes: null }
  | { readonly telegramFileId: null; readonly bytes: Uint8Array }
);

/** Manuals attached to machines (spec 014, US2): private files, many machines per document. */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
    @Optional() @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage | null,
  ) {}

  private uploader() {
    return sql<string>`coalesce((select ${authUser.name} from ${authUser} where ${authUser.id}::text = ${equipmentDocuments.uploadedBy}), ${equipmentDocuments.uploadedBy})`;
  }

  async forEquipment(equipmentId: string): Promise<EquipmentDocumentView[]> {
    const rows = await this.db
      .select({
        doc: equipmentDocuments,
        linkedAt: equipmentDocumentLinks.linkedAt,
        uploadedBy: this.uploader(),
      })
      .from(equipmentDocumentLinks)
      .innerJoin(equipmentDocuments, eq(equipmentDocuments.id, equipmentDocumentLinks.documentId))
      .where(
        and(
          eq(equipmentDocumentLinks.equipmentId, equipmentId),
          isNull(equipmentDocumentLinks.unlinkedAt),
        ),
      )
      .orderBy(asc(equipmentDocuments.title));
    return rows.map((row) => ({
      ...this.view(row.doc, row.uploadedBy),
      linkedAt: row.linkedAt.toISOString(),
    }));
  }

  private view(doc: typeof equipmentDocuments.$inferSelect, uploadedBy: string) {
    return {
      id: doc.id,
      title: doc.title,
      kind: doc.kind,
      language: doc.language,
      edition: doc.edition,
      sourceUrl: doc.sourceUrl,
      sizeBytes: doc.sizeBytes,
      uploadedBy,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  /** Every stored document with the machines it is linked to, for attaching to another one. */
  async library(): Promise<LibraryDocumentView[]> {
    const docs = await this.db
      .select({ doc: equipmentDocuments, uploadedBy: this.uploader() })
      .from(equipmentDocuments)
      .orderBy(desc(equipmentDocuments.createdAt));
    const links = docs.length
      ? await this.db
          .select({ documentId: equipmentDocumentLinks.documentId, code: equipment.code })
          .from(equipmentDocumentLinks)
          .innerJoin(equipment, eq(equipment.id, equipmentDocumentLinks.equipmentId))
          .where(
            and(
              inArray(
                equipmentDocumentLinks.documentId,
                docs.map((row) => row.doc.id),
              ),
              isNull(equipmentDocumentLinks.unlinkedAt),
            ),
          )
      : [];
    const codes = new Map<string, string[]>();
    for (const link of links)
      codes.set(link.documentId, [...(codes.get(link.documentId) ?? []), link.code]);
    return docs.map((row) => ({
      ...this.view(row.doc, row.uploadedBy),
      equipmentCodes: codes.get(row.doc.id) ?? [],
    }));
  }

  /** Stores the file, then records and links it in one transaction; a failed record removes the file. */
  async upload(
    equipmentId: string,
    upload: { readonly meta: DocumentUploadQuery; readonly bytes: Buffer },
    actor: Actor,
  ): Promise<{ id: string }> {
    await assertPdf(upload.bytes);
    const storage = this.requireStorage();
    if (!storage.put)
      throw new DomainError('STORAGE_UNAVAILABLE', 503, 'Storage cannot store files');
    const id = randomUUID();
    const storageKey = `${currentStoragePrefix()}equipment-documents/${id}.pdf`;
    await storage.put(storageKey, upload.bytes, 'application/pdf');
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(equipmentDocuments).values({
          id,
          title: upload.meta.title,
          kind: upload.meta.kind,
          language: textOrNull(upload.meta.language),
          edition: textOrNull(upload.meta.edition),
          sourceUrl: textOrNull(upload.meta.sourceUrl),
          storageKey,
          contentType: 'application/pdf',
          sizeBytes: upload.bytes.length,
          sha256: createHash('sha256').update(upload.bytes).digest('hex'),
          uploadedBy: actor.id ?? 'system',
        });
        await tx
          .insert(equipmentDocumentLinks)
          .values({ equipmentId, documentId: id, linkedBy: actor.id ?? 'system' });
        await this.audit.record(tx, {
          actor,
          action: 'equipment_document.upload',
          objectType: 'equipment_document',
          objectId: id,
          after: {
            equipmentId,
            title: upload.meta.title,
            kind: upload.meta.kind,
            sizeBytes: upload.bytes.length,
          },
        });
      });
    } catch (error) {
      await storage
        .delete?.(storageKey)
        .catch(() => this.logger.warn({ event: 'document_orphan', id }));
      throw error;
    }
    return { id };
  }

  async attach(equipmentId: string, documentId: string, actor: Actor): Promise<{ id: string }> {
    await this.db.transaction(async (tx) => {
      const [doc] = await tx
        .select({ id: equipmentDocuments.id })
        .from(equipmentDocuments)
        .where(eq(equipmentDocuments.id, documentId));
      if (!doc) throw new DomainError('DOCUMENT_NOT_FOUND', 404, 'Document not found');
      await tx
        .insert(equipmentDocumentLinks)
        .values({ equipmentId, documentId, linkedBy: actor.id ?? 'system' })
        .onConflictDoNothing();
      await this.audit.record(tx, {
        actor,
        action: 'equipment_document.link',
        objectType: 'equipment_document',
        objectId: documentId,
        after: { equipmentId },
      });
    });
    return { id: documentId };
  }

  /** Unlinking archives the link; the file stays for plans and completed work (FR-011). */
  async unlink(equipmentId: string, documentId: string, actor: Actor) {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(equipmentDocumentLinks)
        .set({ unlinkedAt: now, unlinkedBy: actor.id ?? 'system' })
        .where(
          and(
            eq(equipmentDocumentLinks.equipmentId, equipmentId),
            eq(equipmentDocumentLinks.documentId, documentId),
            isNull(equipmentDocumentLinks.unlinkedAt),
          ),
        );
      await this.audit.record(tx, {
        actor,
        action: 'equipment_document.unlink',
        objectType: 'equipment_document',
        objectId: documentId,
        after: { equipmentId },
      });
    });
    return { id: documentId };
  }

  /** Machines a document is or was linked to, for scope checks on opening it. */
  async equipmentOf(documentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ equipmentId: equipmentDocumentLinks.equipmentId })
      .from(equipmentDocumentLinks)
      .where(eq(equipmentDocumentLinks.documentId, documentId));
    return rows.map((row) => row.equipmentId);
  }

  async link(documentId: string, now: Date = new Date()): Promise<DocumentLinkView> {
    const [doc] = await this.db
      .select({ storageKey: equipmentDocuments.storageKey })
      .from(equipmentDocuments)
      .where(eq(equipmentDocuments.id, documentId));
    if (!doc) throw new DomainError('DOCUMENT_NOT_FOUND', 404, 'Document not found');
    const url = await this.requireStorage().presignGet(doc.storageKey, LINK_TTL_SECONDS);
    return { url, expiresAt: new Date(now.getTime() + LINK_TTL_SECONDS * 1000).toISOString() };
  }

  /** The manual to send in Telegram: the plan's source document first, then an operating manual. */
  async manualFor(equipmentId: string, preferredId: string | null): Promise<StoredDocument | null> {
    const docs = await this.db
      .select({
        id: equipmentDocuments.id,
        title: equipmentDocuments.title,
        kind: equipmentDocuments.kind,
        storageKey: equipmentDocuments.storageKey,
        telegramFileId: equipmentDocuments.telegramFileId,
      })
      .from(equipmentDocumentLinks)
      .innerJoin(equipmentDocuments, eq(equipmentDocuments.id, equipmentDocumentLinks.documentId))
      .where(
        and(
          eq(equipmentDocumentLinks.equipmentId, equipmentId),
          isNull(equipmentDocumentLinks.unlinkedAt),
        ),
      );
    const chosen =
      docs.find((doc) => doc.id === preferredId) ??
      docs.find((doc) => doc.kind === EquipmentDocumentKind.OPERATING_MANUAL) ??
      docs.at(0);
    if (!chosen) return null;
    if (chosen.telegramFileId)
      return {
        title: chosen.title,
        bytes: null,
        telegramFileId: chosen.telegramFileId,
        documentId: chosen.id,
      };
    const bytes = await this.requireStorage().get?.(chosen.storageKey);
    if (!bytes) throw new DomainError('STORAGE_UNAVAILABLE', 503, 'Storage unavailable');
    return { title: chosen.title, bytes, telegramFileId: null, documentId: chosen.id };
  }

  /** Remembers Telegram's file id so the next send does not upload the file again. */
  async rememberTelegramFile(documentId: string, fileId: string): Promise<void> {
    await this.db
      .update(equipmentDocuments)
      .set({ telegramFileId: fileId })
      .where(eq(equipmentDocuments.id, documentId));
  }

  private requireStorage(): ObjectStorage {
    if (!this.storage) throw new DomainError('STORAGE_UNAVAILABLE', 503, 'Storage unavailable');
    return this.storage;
  }
}
