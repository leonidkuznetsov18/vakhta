import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AnthropicAnswerer, SUPPORT_ANSWERER } from './answerer.js';
import { KnowledgeService } from './knowledge.service.js';
import { SupportBotService } from './support-bot.service.js';
import { SupportController } from './support.controller.js';
import { SUPPORT_OPTIONS, SupportService, type SupportOptions } from './support.service.js';
import { OpenAiVoice, SUPPORT_VOICE } from './voice.js';

/**
 * The support assistant (docs/features/12-support-bot.md): a second Telegram bot that answers
 * questions about the system from the feature docs, the user guide and the changelog.
 */
@Module({
  imports: [IdentityModule],
  controllers: [SupportController],
  providers: [
    KnowledgeService,
    SupportService,
    SupportBotService,
    {
      provide: SUPPORT_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): SupportOptions => ({
        allowedTelegramIds: config
          .get('SUPPORT_ALLOWED_TELEGRAM_IDS', { infer: true })
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id)),
        rateLimitPerHour: config.get('SUPPORT_RATE_LIMIT_PER_HOUR', { infer: true }),
        historyTurns: 6,
      }),
      inject: [ConfigService],
    },
    {
      provide: SUPPORT_ANSWERER,
      useFactory: (config: ConfigService<Env, true>) => {
        const key = config.get('ANTHROPIC_API_KEY', { infer: true });
        return key
          ? new AnthropicAnswerer(key, config.get('SUPPORT_MODEL', { infer: true }))
          : null;
      },
      inject: [ConfigService],
    },
    {
      provide: SUPPORT_VOICE,
      useFactory: (config: ConfigService<Env, true>) => {
        const key = config.get('OPENAI_API_KEY', { infer: true });
        return key ? new OpenAiVoice(key) : null;
      },
      inject: [ConfigService],
    },
  ],
  exports: [SupportService],
})
export class SupportModule {}
