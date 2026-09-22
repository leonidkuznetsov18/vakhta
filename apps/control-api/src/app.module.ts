import { OperatorInvitationsController } from './auth/operator-invitations.controller.js';
import { OperatorInvitationsService } from './auth/operator-invitations.service.js';
import { AdministratorsController } from './administrators/administrators.controller.js';
import { AdministratorsService } from './administrators/administrators.service.js';
import { OnboardingController } from './public/onboarding.controller.js';
import { OnboardingService } from './public/onboarding.service.js';
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
import { TenantSettingsController } from './settings/tenant-settings.controller.js';
import { TenantSettingsService } from './settings/tenant-settings.service.js';
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
    AdministratorsController,
    BrandingController,
    PublicLogoController,
    HealthController,
    PublicController,
    OnboardingController,
    TenantsController,
    TenantSettingsController,
    JobsController,
    OperatorsController,
    OperatorInvitationsController,
  ],
  providers: [
    AdministratorsService,
    BrandingService,
    LogoStorage,
    ControlAudit,
    OnboardingService,
    OperatorGuard,
    OperatorInvitationsService,
    TelegramProvider,
    ProvisioningService,
    ProvisioningRunner,
    TenantsService,
    TenantSettingsService,
  ],
})
export class AppModule {}
import { BrandingController, PublicLogoController } from './branding/branding.controller.js';
import { BrandingService } from './branding/branding.service.js';
import { LogoStorage } from './branding/logo-storage.js';
