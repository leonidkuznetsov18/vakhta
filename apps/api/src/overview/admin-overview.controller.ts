import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  OverviewEventsQuery,
  OverviewQuery,
  type OverviewEvent,
  type OverviewSnapshot,
} from '@vakhta/contracts';
import { CurrentUser, Roles, WebAuthGuard, type WebUser } from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { OVERVIEW_READERS, OverviewService } from './overview.service.js';

/** Overview command center (spec 004): the current shift in the reader's granted scope. */
@Controller('admin/overview')
@UseGuards(WebAuthGuard)
@Roles(...OVERVIEW_READERS)
export class AdminOverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  snapshot(
    @Query(new ZodValidationPipe(OverviewQuery)) q: OverviewQuery,
    @CurrentUser() user: WebUser,
  ): Promise<OverviewSnapshot> {
    return this.overview.snapshot(user.grants, q);
  }

  @Get('events')
  events(
    @Query(new ZodValidationPipe(OverviewEventsQuery)) q: OverviewEventsQuery,
    @CurrentUser() user: WebUser,
  ): Promise<OverviewEvent[]> {
    return this.overview.events(user.grants, q);
  }
}
