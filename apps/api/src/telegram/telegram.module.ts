import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { TelegramController } from './telegram.controller.js';
import { TelegramService } from './telegram.service.js';
import { UpdateDedup } from './update-dedup.js';

@Module({
  imports: [IdentityModule, SchedulingModule],
  controllers: [TelegramController],
  providers: [TelegramService, UpdateDedup],
  exports: [TelegramService],
})
export class TelegramModule {}
