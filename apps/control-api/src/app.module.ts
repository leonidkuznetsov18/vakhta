import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ControlAudit } from './audit/audit.service.js';
import { ControlAuthModule } from './auth/auth.module.js';
import { OperatorGuard } from './auth/operator.guard.js';
import { OperatorsController } from './auth/operators.controller.js';
import { loadControlEnv } from './config/env.js';
import { HealthController } from './health/health.controller.js';
import { RegistryModule } from './infra/registry.module.js';
import { JobsController } from './provisioning/jobs.controller.js';
import { ProvisioningService } from './provisioning/provisioning.service.js';
import { ProvisioningRunner } from './provisioning/runner.js';
import { TelegramProvider } from './provisioning/telegram.provider.js';
import { PublicController } from './public/public.controller.js';
import { TenantsController } from './tenants/tenants.controller.js';
import { TenantsService } from './tenants/tenants.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: (config) => loadControlEnv(config),
    }),
    RegistryModule,
    ControlAuthModule,
  ],
  controllers: [
    HealthController,
    PublicController,
    TenantsController,
    JobsController,
    OperatorsController,
  ],
  providers: [
    ControlAudit,
    OperatorGuard,
    TelegramProvider,
    ProvisioningService,
    ProvisioningRunner,
    TenantsService,
  ],
})
export class AppModule {}
