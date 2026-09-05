import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from '@vakhta/db';
import { qrChallenges, qrTerminals, type Database } from '@vakhta/db';
import { buildDeepLink, challengeExpiresAt } from '@vakhta/domain';
import { generateChallengeToken, hashChallengeToken, hashDeviceToken } from '@vakhta/domain/node';
import type { KioskChallengeResponse } from '@vakhta/contracts';
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
  ) {}

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
