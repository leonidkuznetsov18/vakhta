import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, eq, idempotencyKeys, sql, type Database } from '@vakhta/db';
import { ScheduleCommandResult, ScheduleWebCommand, Month } from '@vakhta/contracts';
import { canActOn, type RoleGrant, type WebRole } from '@vakhta/domain';
import { z } from 'zod';
import { RolesService } from '../auth/roles.service.js';
import { webUserActor, type WebUser } from '../auth/web-auth.guard.js';
import { DomainError } from '../common/domain-error.js';
import { DATABASE } from '../infra/database.module.js';
import { ScheduleService } from './schedule.service.js';

const RECEIPT_SCOPE = 'schedule-command:v1';
const Target = z.object({ siteId: z.uuid(), orgUnitId: z.uuid(), periodMonth: Month });
const Receipt = z.object({
  schemaVersion: z.literal(1),
  actorId: z.uuid(),
  target: Target,
  result: ScheduleCommandResult,
});

/** Canonical validated JSON; object order is irrelevant, array order remains significant. */
function canonical(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  throw new Error('Schedule command contains a non-JSON value');
}

function fingerprint(
  command: ScheduleWebCommand,
  actorId: string,
  target: z.infer<typeof Target>,
): string {
  return createHash('sha256')
    .update(canonical({ command, actor: { type: 'WEB_USER', id: actorId }, target }))
    .digest('hex');
}

function authorize(
  grants: readonly RoleGrant[],
  command: ScheduleWebCommand,
  target: z.infer<typeof Target>,
): void {
  const roles: WebRole[] = ['RETURN', 'PUBLISH', 'REVISE'].includes(command.action)
    ? ['ADMIN', 'PRODUCTION_HEAD']
    : ['ADMIN', 'PLANNER'];
  if (!canActOn(grants, roles, target))
    throw new ForbiddenException('Schedule command is outside the current role scope');
}

/** Web commands own one transaction; internal request workflows retain their own transaction. */
@Injectable()
export class ScheduleCommandService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly schedules: ScheduleService,
    private readonly roles: RolesService,
  ) {}

  async execute(input: ScheduleWebCommand, user: WebUser): Promise<ScheduleCommandResult> {
    const command = ScheduleWebCommand.parse(input);
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${RECEIPT_SCOPE}:${command.commandId}`}, 0))`,
      );
      const [stored] = await tx
        .select()
        .from(idempotencyKeys)
        .where(
          and(eq(idempotencyKeys.scope, RECEIPT_SCOPE), eq(idempotencyKeys.key, command.commandId)),
        );
      if (stored) {
        const receipt = Receipt.parse(stored.response);
        if (
          receipt.actorId !== user.id ||
          receipt.result.commandId !== command.commandId ||
          stored.requestHash !== fingerprint(command, user.id, receipt.target)
        ) {
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            409,
            'Command ID is already bound to another request',
          );
        }
        const grants = await this.roles.grantsOf(user.id, tx);
        authorize(grants, command, receipt.target);
        return receipt.result;
      }
      const target = Target.parse(
        command.action === 'CREATE'
          ? command.payload
          : await this.schedules.lockVersion(command.versionId, tx),
      );
      // Read after both command and version locks, without checking revision before authorization.
      // Grant revocation is not serialized with the eventual commit.
      const grants = await this.roles.grantsOf(user.id, tx);
      authorize(grants, command, target);
      if (command.action === 'CREATE' && command.payload.basedOnVersionId) {
        const source = await this.schedules.requireVersion(command.payload.basedOnVersionId, tx);
        authorize(grants, command, source);
      }
      const result = ScheduleCommandResult.parse(
        await this.schedules.applyCommandWithin(tx, command, webUserActor({ ...user, grants })),
      );
      const receipt = Receipt.parse({ schemaVersion: 1, actorId: user.id, target, result });
      await tx.insert(idempotencyKeys).values({
        scope: RECEIPT_SCOPE,
        key: command.commandId,
        requestHash: fingerprint(command, user.id, target),
        response: receipt,
      });
      return result;
    });
  }
}
