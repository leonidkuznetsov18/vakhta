import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { KioskController } from './kiosk.controller.js';
import { KIOSK_OPTIONS, KioskService, type KioskOptions } from './kiosk.service.js';

@Module({
  controllers: [KioskController],
  providers: [
    KioskService,
    {
      provide: KIOSK_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): KioskOptions => ({
        rotationSeconds: config.get('QR_ROTATION_SECONDS', { infer: true }),
        ttlSeconds: config.get('QR_TTL_SECONDS', { infer: true }),
        botUsername: config.get('TELEGRAM_BOT_USERNAME', { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [KioskService],
})
export class KioskModule {}
