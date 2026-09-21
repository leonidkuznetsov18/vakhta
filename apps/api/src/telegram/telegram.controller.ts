import {
  Body,
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import type { Update } from 'grammy/types';
import { currentTenant } from '../infra/tenant-context.js';
import { TelegramService } from './telegram.service.js';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  /** Legacy webhook path: the tenant is the one bound by the request host. */
  @Post('webhook')
  @HttpCode(200)
  webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: Update,
  ): Promise<{ ok: true }> {
    return this.deliver(currentTenant().tenant.id, secret, update);
  }

  /** Per-tenant webhook path (spec AC-008); the id must match the host-bound tenant. */
  @Post('webhook/:tenantId')
  @HttpCode(200)
  tenantWebhook(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: Update,
  ): Promise<{ ok: true }> {
    if (tenantId !== currentTenant().tenant.id) throw new NotFoundException();
    return this.deliver(tenantId, secret, update);
  }

  /** Секретний заголовок перевіряється до будь-якої обробки (ТЗ 12.2, 13). */
  private async deliver(
    tenantId: string,
    secret: string | undefined,
    update: Update,
  ): Promise<{ ok: true }> {
    if (!this.telegram.verifySecret(tenantId, secret)) throw new UnauthorizedException();
    await this.telegram.handleUpdate(tenantId, update);
    return { ok: true };
  }
}
