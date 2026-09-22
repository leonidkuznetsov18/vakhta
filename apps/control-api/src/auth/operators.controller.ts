import {
  Body,
  Controller,
  Get,
  Post,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CreateOperatorCommand, OperatorRoleSchema, type OperatorView } from '@vakhta/contracts';
import {
  controlAuthUser,
  controlAuthAccount,
  eq,
  sql,
  type RegistryDatabase,
} from '@vakhta/registry';
import { OperatorStatus } from '@vakhta/domain';
import { OperatorInvitationsService } from './operator-invitations.service.js';
import { ControlAudit } from '../audit/audit.service.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { REGISTRY } from '../infra/registry.module.js';
import {
  CurrentOperator,
  OperatorGuard,
  OperatorRole,
  OperatorRoles,
  type Operator,
} from './operator.guard.js';

const SetOperatorCommand = z.object({
  role: OperatorRoleSchema.optional(),
  status: z.enum(OperatorStatus).optional(),
});
type SetOperatorCommand = z.infer<typeof SetOperatorCommand>;

@Controller('control/operators')
@UseGuards(OperatorGuard)
export class OperatorsController {
  constructor(
    @Inject(REGISTRY) private readonly db: RegistryDatabase,
    private readonly audit: ControlAudit,
    private readonly invitations: OperatorInvitationsService,
  ) {}

  @Get('me')
  me(@CurrentOperator() operator: Operator): Operator {
    return operator;
  }

  @Get()
  async list(): Promise<OperatorView[]> {
    return this.db
      .selectDistinct({
        id: controlAuthUser.id,
        email: controlAuthUser.email,
        name: controlAuthUser.name,
        role: controlAuthUser.role,
        status: controlAuthUser.status,
        twoFactorEnabled: controlAuthUser.twoFactorEnabled,
        invitationPending: sql<boolean>`${controlAuthAccount.id} IS NULL`,
      })
      .from(controlAuthUser)
      .leftJoin(controlAuthAccount, eq(controlAuthAccount.userId, controlAuthUser.id))
      .orderBy(controlAuthUser.email);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @OperatorRoles(OperatorRole.PLATFORM_ADMIN)
  create(
    @Body(new ZodValidationPipe(CreateOperatorCommand)) body: CreateOperatorCommand,
    @CurrentOperator() operator: Operator,
  ) {
    return this.invitations.create(body, operator);
  }

  @Post(':id/invitations')
  @Header('Cache-Control', 'no-store')
  @OperatorRoles(OperatorRole.PLATFORM_ADMIN)
  reissue(@Param('id', ParseUUIDPipe) id: string, @CurrentOperator() operator: Operator) {
    return this.invitations.reissue(id, operator);
  }

  /** Nobody demotes or disables themselves; the last administrator stays. */
  @Put(':id')
  @OperatorRoles(OperatorRole.PLATFORM_ADMIN)
  async set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetOperatorCommand)) body: SetOperatorCommand,
    @CurrentOperator() operator: Operator,
  ): Promise<OperatorView[]> {
    if (id === operator.id) throw new Error('An operator cannot change their own role or status');
    await this.db.transaction(async (tx) => {
      await tx
        .update(controlAuthUser)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(controlAuthUser.id, id));
      await this.audit.record(tx, {
        actor: operator,
        action: 'operator.update',
        tenantId: null,
        objectType: 'operator',
        objectId: id,
        after: { ...body },
      });
    });
    return this.list();
  }
}
