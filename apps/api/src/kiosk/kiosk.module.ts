import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { currentSettings, currentTenant, lateBound } from '../infra/tenant-context.js';
import { KioskController } from './kiosk.controller.js';
import { KIOSK_OPTIONS, KioskService, type KioskOptions } from './kiosk.service.js';

@Module({
  controllers: [KioskController],
  providers: [
    KioskService,
    {
      // The deep link must open the tenant's own bot; QR timing stays a platform default for now.
      provide: KIOSK_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): KioskOptions =>
        lateBound(() => ({
          rotationSeconds: currentSettings().qrRotationSeconds,
          ttlSeconds: currentSettings().qrTtlSeconds,
          botUsername:
            currentTenant().tenant.botUsername ??
            config.get('TELEGRAM_BOT_USERNAME', { infer: true }),
        })),
      inject: [ConfigService],
    },
  ],
  exports: [KioskService],
})
export class KioskModule {}
