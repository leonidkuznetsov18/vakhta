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
  imports: [OrgModule],
  controllers: [AdminEmployeesController, AdminPositionsController],
  providers: [
    EmployeesService,
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
