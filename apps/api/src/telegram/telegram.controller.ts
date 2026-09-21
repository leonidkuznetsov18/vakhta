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
import { secretMatches, TelegramService } from './telegram.service.js';
import { tenantHasModule } from '@vakhta/registry';
import { TenantModule } from '@vakhta/domain';

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
    const tenant = currentTenant().tenant;
    // A switched-off bot acknowledges and drops genuine updates, so Telegram keeps no retry queue
    // that would replay stale messages once the module is enabled again (spec AC-018).
    if (!tenantHasModule(tenant, TenantModule.WORKER_BOT)) {
      if (!secretMatches(tenant.webhookSecret, secret)) throw new UnauthorizedException();
      return { ok: true };
    }
    if (!this.telegram.verifySecret(tenantId, secret)) throw new UnauthorizedException();
    await this.telegram.handleUpdate(tenantId, update);
    return { ok: true };
  }
}
