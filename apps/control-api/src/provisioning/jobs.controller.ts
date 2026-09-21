import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ProvisioningStepSchema, type ProvisioningJobView } from '@vakhta/contracts';
import {
  CurrentOperator,
  OperatorGuard,
  OperatorRole,
  OperatorRoles,
  type Operator,
} from '../auth/operator.guard.js';
import { jobForOperator } from '../auth/operator-views.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ProvisioningService, type StepCode } from './provisioning.service.js';

@Controller('control/jobs')
@UseGuards(OperatorGuard)
export class JobsController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Get(':id')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOperator() operator: Operator,
  ): Promise<ProvisioningJobView> {
    return jobForOperator(await this.provisioning.get(id), operator);
  }

  @Post(':id/steps/:step/retry')
  @OperatorRoles(OperatorRole.PLATFORM_ADMIN)
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('step', new ZodValidationPipe(ProvisioningStepSchema)) step: StepCode,
    @CurrentOperator() actor: Operator,
  ): Promise<ProvisioningJobView> {
    return this.provisioning.retryStep(id, step, actor);
  }

  @Post(':id/steps/:step/skip')
  @OperatorRoles(OperatorRole.PLATFORM_ADMIN)
  skip(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('step', new ZodValidationPipe(ProvisioningStepSchema)) step: StepCode,
    @CurrentOperator() actor: Operator,
  ): Promise<ProvisioningJobView> {
    return this.provisioning.skipStep(id, step, actor);
  }
}
