import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { OperatorRoleSchema, type OperatorView } from '@vakhta/contracts';
import { controlAuthUser, eq, type RegistryDatabase } from '@vakhta/registry';
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
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});
type SetOperatorCommand = z.infer<typeof SetOperatorCommand>;

@Controller('control/operators')
@UseGuards(OperatorGuard)
export class OperatorsController {
  constructor(
    @Inject(REGISTRY) private readonly db: RegistryDatabase,
    private readonly audit: ControlAudit,
  ) {}

  @Get('me')
  me(@CurrentOperator() operator: Operator): Operator {
    return operator;
  }

  @Get()
  async list(): Promise<OperatorView[]> {
    const rows = await this.db.select().from(controlAuthUser).orderBy(controlAuthUser.email);
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      status: r.status,
      twoFactorEnabled: r.twoFactorEnabled,
    }));
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
