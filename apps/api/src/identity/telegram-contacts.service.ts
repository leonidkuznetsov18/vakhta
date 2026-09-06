import { Inject, Injectable } from '@nestjs/common';
import { eq, sql, telegramContacts, type Database } from '@vakhta/db';
import { DATABASE } from '../infra/database.module.js';
import { SHORT_TERM_STORE, type ShortTermStore } from '../infra/short-term-store.js';

export interface TelegramSender {
  readonly id: number;
  readonly username?: string | undefined;
  readonly first_name?: string | undefined;
  readonly last_name?: string | undefined;
  readonly language_code?: string | undefined;
}

export interface TelegramContact {
  readonly telegramUserId: number;
  readonly chatId: number;
  readonly username: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
}

/** One write per user per hour at most; the bot sees many updates from the same person. */
const REMEMBER_TTL_SECONDS = 3600;

/**
 * Who has ever opened the worker bot. A Telegram bot cannot start a conversation, so the panel
 * can send an activation card only to people already in this table; the bot fills it from every
 * private update, linked or not.
 */
@Injectable()
export class TelegramContactsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(SHORT_TERM_STORE) private readonly store: ShortTermStore,
  ) {}

  async remember(from: TelegramSender, chatId: number): Promise<void> {
    const username = from.username ? from.username.toLowerCase() : null;
    const key = `tgc:${from.id}:${username ?? '-'}:${chatId}`;
    if ((await this.store.get(key)) !== null) return;
    const now = new Date();
    await this.db
      .insert(telegramContacts)
      .values({
        telegramUserId: from.id,
        chatId,
        username,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
        languageCode: from.language_code ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: telegramContacts.telegramUserId,
        set: {
          chatId,
          username,
          firstName: from.first_name ?? null,
          lastName: from.last_name ?? null,
          languageCode: from.language_code ?? null,
          lastSeenAt: now,
        },
      });
    await this.store.set(key, '1', REMEMBER_TTL_SECONDS);
  }

  /** The most recently seen contact with this username (case-insensitive, with or without "@"). */
  async findByUsername(username: string): Promise<TelegramContact | null> {
    const wanted = username.trim().replace(/^@/, '').toLowerCase();
    if (!wanted) return null;
    const [row] = await this.db
      .select()
      .from(telegramContacts)
      .where(eq(telegramContacts.username, wanted))
      .orderBy(sql`${telegramContacts.lastSeenAt} desc`)
      .limit(1);
    return row
      ? {
          telegramUserId: row.telegramUserId,
          chatId: row.chatId,
          username: row.username,
          firstName: row.firstName,
          lastName: row.lastName,
        }
      : null;
  }
}
