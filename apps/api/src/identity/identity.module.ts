import { EmployeeAvatarCleanupService } from './employee-avatar-cleanup.service.js';
import { EmployeeAvatarController } from './employee-avatar.controller.js';
import { EmployeeAvatarService } from './employee-avatar.service.js';
import { ObjectStorageModule } from '../infra/object-storage.js';
import { EmployeeProfileController } from './employee-profile.controller.js';
import { EmployeeProfileService } from './employee-profile.service.js';
import { EmployeeCompensationService } from './employee-compensation.service.js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { OrgModule } from '../org/org.module.js';
import {
  ACTIVATION_OPTIONS,
  ActivationService,
  type ActivationOptions,
} from './activation.service.js';
import { AdminEmployeesController } from './admin-employees.controller.js';
import { AdminPositionsController } from './admin-positions.controller.js';
import { EmployeesService } from './employees.service.js';
import { PositionsService } from './positions.service.js';

@Module({
  imports: [OrgModule, ObjectStorageModule],
  controllers: [
    AdminEmployeesController,
    AdminPositionsController,
    EmployeeProfileController,
    EmployeeAvatarController,
  ],
  providers: [
    EmployeesService,
    EmployeeProfileService,
    EmployeeAvatarService,
    EmployeeAvatarCleanupService,
    EmployeeCompensationService,
    ActivationService,
    PositionsService,
    {
      provide: ACTIVATION_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): ActivationOptions => ({
        pepper: config.get('ACTIVATION_PEPPER', { infer: true }),
        ttlHours: config.get('ACTIVATION_TTL_HOURS', { infer: true }),
        maxAttempts: config.get('ACTIVATION_MAX_ATTEMPTS', { infer: true }),
        pendingTtlSeconds: 600,
        botUsername: config.get('TELEGRAM_BOT_USERNAME', { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [EmployeesService, ActivationService, PositionsService],
})
export class IdentityModule {}
