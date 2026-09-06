import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { SendActivationCommand, type ActivationDelivered } from '@vakhta/contracts';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ActivationDeliveryService } from './activation-delivery.service.js';

/** HR sends the activation card to the employee instead of copying the code by hand. */
@Controller('admin/employees')
@UseGuards(WebAuthGuard)
@Roles('ADMIN', 'HR')
export class AdminActivationController {
  constructor(private readonly delivery: ActivationDeliveryService) {}

  @Post(':id/activation/send')
  @HttpCode(200)
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SendActivationCommand)) body: SendActivationCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ActivationDelivered> {
    return this.delivery.send(id, body.channel, webUserActor(user));
  }
}
