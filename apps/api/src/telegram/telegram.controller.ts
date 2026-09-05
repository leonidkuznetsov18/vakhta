import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import type { Update } from 'grammy/types';
import { TelegramService } from './telegram.service.js';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  /** Вхідна точка webhook. Секретний заголовок перевіряється до будь-якої обробки (ТЗ 12.2, 13). */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: Update,
  ): Promise<{ ok: true }> {
    if (!this.telegram.verifySecret(secret)) throw new UnauthorizedException();
    await this.telegram.handleUpdate(update);
    return { ok: true };
  }
}
