import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from '@vakhta/db';
import { qrChallenges, qrTerminals, terminalPairingCodes, type Database } from '@vakhta/db';
import { buildDeepLink, challengeExpiresAt } from '@vakhta/domain';
import {
  generateChallengeToken,
  generateDeviceToken,
  hashChallengeToken,
  hashDeviceToken,
  hashPairingCode,
  isPairingCodeShape,
} from '@vakhta/domain/node';
import type { KioskChallengeResponse, TerminalPaired } from '@vakhta/contracts';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';

export interface KioskOptions {
  readonly rotationSeconds: number;
  readonly ttlSeconds: number;
  readonly botUsername: string;
}

export const KIOSK_OPTIONS = Symbol('KIOSK_OPTIONS');

/**
 * Видача challenge терміналу (FR-QR-01…04, ADR-4). Токен живе лише на екрані і в deep link;
 * у базі хеш, термінал і строк дії. Використання challenge зʼявиться разом із присутністю.
 */
@Injectable()
export class KioskService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(KIOSK_OPTIONS) private readonly options: KioskOptions,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
  ) {}

  /**
   * Exchange a one-time pairing code for a fresh device token (FR-QR-01). The previous token of
   * the terminal stops working at once, so re-pairing is also the way to rotate a leaked token.
   * null when the code is unknown, used or expired; the caller answers 401 without details.
   */
  async pair(code: string): Promise<TerminalPaired | null> {
    if (!isPairingCodeShape(code)) return null;
    const now = new Date();
    return this.db.transaction(async (tx) => {
      const [pairing] = await tx
        .select()
        .from(terminalPairingCodes)
        .where(
          and(
            eq(terminalPairingCodes.codeHash, hashPairingCode(code)),
            isNull(terminalPairingCodes.usedAt),
            gt(terminalPairingCodes.expiresAt, now),
          ),
        )
        .for('update')
        .limit(1);
      if (!pairing) return null;
      const deviceToken = generateDeviceToken();
      const [terminal] = await tx
        .update(qrTerminals)
        .set({ deviceTokenHash: hashDeviceToken(deviceToken), lastSeenAt: now })
        .where(eq(qrTerminals.id, pairing.terminalId))
        .returning();
      if (!terminal) return null;
      await tx
        .update(terminalPairingCodes)
        .set({ usedAt: now })
        .where(eq(terminalPairingCodes.id, pairing.id));
      const actor = {
        type: 'TERMINAL',
        id: terminal.id,
        role: 'TERMINAL',
        label: terminal.name,
      } as const;
      await this.events.append(tx, {
        type: 'QR_TERMINAL_PAIRED',
        source: 'TERMINAL',
        actor,
        payload: { terminalId: terminal.id },
      });
      await this.audit.record(tx, {
        actor,
        action: 'qr_terminal.pair',
        objectType: 'qr_terminal',
        objectId: terminal.id,
        after: { paired: true },
      });
      return { terminalId: terminal.id, terminalName: terminal.name, deviceToken };
    });
  }

  /** null, якщо device token невідомий або термінал вимкнений. */
  async issueChallenge(deviceToken: string): Promise<KioskChallengeResponse | null> {
    const [terminal] = await this.db
      .select()
      .from(qrTerminals)
      .where(
        and(
          eq(qrTerminals.deviceTokenHash, hashDeviceToken(deviceToken)),
          eq(qrTerminals.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!terminal) return null;

    const token = generateChallengeToken();
    const issuedAt = new Date();
    const expiresAt = challengeExpiresAt(issuedAt, this.options.ttlSeconds);

    await this.db.transaction(async (tx) => {
      await tx.insert(qrChallenges).values({
        terminalId: terminal.id,
        tokenHash: hashChallengeToken(token),
        issuedAt,
        expiresAt,
      });
      await tx
        .update(qrTerminals)
        .set({ lastSeenAt: issuedAt })
        .where(eq(qrTerminals.id, terminal.id));
    });

    return {
      deepLink: buildDeepLink(this.options.botUsername, token),
      expiresAt: expiresAt.toISOString(),
      rotationSeconds: this.options.rotationSeconds,
      terminalName: terminal.name,
    };
  }
}
