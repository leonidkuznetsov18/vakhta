import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { IdentityModule } from '../identity/identity.module.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { TelegramService } from '../telegram/telegram.service.js';
import { AdminActivationController } from './admin-activation.controller.js';
import {
  ACTIVATION_TELEGRAM_SENDER,
  ActivationDeliveryService,
} from './activation-delivery.service.js';
import { MAIL_SENDER, SmtpMailSender } from './mail.js';

/** Activation cards by e-mail (SMTP) or through the worker bot; both channels are optional. */
@Module({
  imports: [IdentityModule, TelegramModule],
  controllers: [AdminActivationController],
  providers: [
    ActivationDeliveryService,
    {
      provide: MAIL_SENDER,
      useFactory: (config: ConfigService<Env, true>) => {
        const url = config.get('SMTP_URL', { infer: true });
        const from = config.get('MAIL_FROM', { infer: true });
        return url && from
          ? new SmtpMailSender(url, from, config.get('MAIL_REPLY_TO', { infer: true }))
          : null;
      },
      inject: [ConfigService],
    },
    { provide: ACTIVATION_TELEGRAM_SENDER, useExisting: TelegramService },
  ],
})
export class ActivationModule {}
