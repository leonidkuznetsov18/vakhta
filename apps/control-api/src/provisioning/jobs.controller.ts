import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ProvisioningStepSchema, type ProvisioningJobView } from '@vakhta/contracts';
import { OperatorGuard, OperatorRole, OperatorRoles } from '../auth/operator.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ProvisioningService, type StepCode } from './provisioning.service.js';

@Controller('control/jobs')
@UseGuards(OperatorGuard)
export class JobsController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProvisioningJobView> {
    return this.provisioning.get(id);
  }

  @Post(':id/steps/:step/retry')
  @OperatorRoles(OperatorRole.PLATFORM_ADMIN)
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('step', new ZodValidationPipe(ProvisioningStepSchema)) step: StepCode,
  ): Promise<ProvisioningJobView> {
    return this.provisioning.retryStep(id, step);
  }

  @Post(':id/steps/:step/skip')
  @OperatorRoles(OperatorRole.PLATFORM_ADMIN)
  skip(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('step', new ZodValidationPipe(ProvisioningStepSchema)) step: StepCode,
  ): Promise<ProvisioningJobView> {
    return this.provisioning.skipStep(id, step);
  }
}
