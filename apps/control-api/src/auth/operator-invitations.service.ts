import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { createLocalAccountIssuer } from 'better-auth/db';
import { OperatorInvitationError } from '@vakhta/contracts';
import { hashPassword } from 'better-auth/crypto';
import { OperatorStatus } from '@vakhta/domain';
import type {
  AcceptOperatorInvitation,
  CreateOperatorCommand,
  OperatorInvitationDetails,
  OperatorInvitationView,
} from '@vakhta/contracts';
import {
  and,
  eq,
  like,
  controlAuthUser,
  controlAuthAccount,
  controlAuthVerification,
  type RegistryDatabase,
  type RegistryDbOrTx,
} from '@vakhta/registry';
import { REGISTRY, CONTROL_ENV } from '../infra/registry.module.js';
import type { ControlEnv } from '../config/env.js';
import { ControlError } from '../common/domain-error.js';
import { ControlAudit } from '../audit/audit.service.js';
import type { Operator } from './operator.guard.js';

const PREFIX = 'operator-invitation:';
const CREDENTIAL = 'credential';
const HOUR_MS = 3_600_000;
const identifier = (token: string) => PREFIX + createHash('sha256').update(token).digest('hex');
function unavailable(): never {
  throw new ControlError(
    OperatorInvitationError.INVITATION_UNAVAILABLE,
    404,
    'Invitation is unavailable',
  );
}

@Injectable()
export class OperatorInvitationsService {
  constructor(
    @Inject(REGISTRY) private readonly db: RegistryDatabase,
    @Inject(CONTROL_ENV) private readonly env: ControlEnv,
    private readonly audit: ControlAudit,
  ) {}

  async create(command: CreateOperatorCommand, actor: Operator): Promise<OperatorInvitationView> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(controlAuthUser)
        .values(command)
        .onConflictDoNothing()
        .returning();
      if (!user)
        throw new ControlError(
          OperatorInvitationError.OPERATOR_EXISTS,
          409,
          'Operator email already exists',
        );
      return this.issue(tx, user.id, actor);
    });
  }

  async reissue(userId: string, actor: Operator): Promise<OperatorInvitationView> {
    return this.db.transaction(async (tx) => {
      await this.lockPending(tx, userId);
      return this.issue(tx, userId, actor);
    });
  }

  private async issue(
    tx: RegistryDbOrTx,
    userId: string,
    actor: Operator,
  ): Promise<OperatorInvitationView> {
    await tx
      .delete(controlAuthVerification)
      .where(
        and(
          eq(controlAuthVerification.value, userId),
          like(controlAuthVerification.identifier, `${PREFIX}%`),
        ),
      );
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.env.INVITATION_TTL_HOURS * HOUR_MS);
    await tx
      .insert(controlAuthVerification)
      .values({ identifier: identifier(token), value: userId, expiresAt });
    await this.audit.record(tx, {
      actor,
      action: 'operator.invitation.issue',
      tenantId: null,
      objectType: 'operator',
      objectId: userId,
    });
    return { operatorId: userId, token, expiresAt: expiresAt.toISOString() };
  }

  private async lockPending(tx: RegistryDbOrTx, userId: string) {
    const [user] = await tx
      .select()
      .from(controlAuthUser)
      .where(eq(controlAuthUser.id, userId))
      .for('update');
    if (user?.status !== OperatorStatus.ACTIVE) return unavailable();
    const [account] = await tx
      .select({ id: controlAuthAccount.id })
      .from(controlAuthAccount)
      .where(eq(controlAuthAccount.userId, userId))
      .limit(1);
    if (account || user.twoFactorEnabled) return unavailable();
    return user;
  }

  private async lockInvitation(tx: RegistryDbOrTx, token: string) {
    const key = identifier(token);
    const [match] = await tx
      .select()
      .from(controlAuthVerification)
      .where(eq(controlAuthVerification.identifier, key));
    if (!match) return unavailable();
    const user = await this.lockPending(tx, match.value);
    // Reissue and acceptance share the user lock; the token must still exist after waiting.
    const [current] = await tx
      .select()
      .from(controlAuthVerification)
      .where(eq(controlAuthVerification.id, match.id));
    if (!current || current.expiresAt.getTime() <= Date.now()) return unavailable();
    return { user, invitation: current };
  }

  async inspect(token: string): Promise<OperatorInvitationDetails> {
    return this.db.transaction(async (tx) => {
      const { user, invitation } = await this.lockInvitation(tx, token);
      return { email: user.email, name: user.name, expiresAt: invitation.expiresAt.toISOString() };
    });
  }

  async accept(command: AcceptOperatorInvitation): Promise<{ ok: true }> {
    // Reject unusable tokens before performing expensive password hashing.
    await this.inspect(command.token);
    const password = await hashPassword(command.password);
    return this.db.transaction(async (tx) => {
      const { user, invitation } = await this.lockInvitation(tx, command.token);
      await tx.insert(controlAuthAccount).values({
        accountId: user.id,
        providerId: CREDENTIAL,
        issuer: createLocalAccountIssuer(CREDENTIAL),
        userId: user.id,
        password,
      });
      await tx.delete(controlAuthVerification).where(eq(controlAuthVerification.id, invitation.id));
      await this.audit.record(tx, {
        actor: null,
        action: 'operator.invitation.accept',
        tenantId: null,
        objectType: 'operator',
        objectId: user.id,
      });
      return { ok: true };
    });
  }
}
