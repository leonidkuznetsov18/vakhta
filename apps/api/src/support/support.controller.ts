import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import type { Update } from 'grammy/types';
import { SupportBotService } from './support-bot.service.js';

@Controller('telegram/support')
export class SupportController {
  constructor(private readonly bot: SupportBotService) {}

  /** Webhook of the support bot; its own secret header, checked before anything else. */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: Update,
  ): Promise<{ ok: true }> {
    if (!this.bot.verifySecret(secret)) throw new UnauthorizedException();
    await this.bot.handleUpdate(update);
    return { ok: true };
  }
}
