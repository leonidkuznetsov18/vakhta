import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UseGuards,
  type MessageEvent,
} from '@nestjs/common';
import { interval, map, merge, type Observable } from 'rxjs';
import {
  HandoverListQuery,
  ResolveHandoverCommand,
  type HandoverDetailView,
  type HandoverListItemView,
  type HandoverView,
  type MediaLinkView,
} from '@vakhta/contracts';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import type { WebRole } from '@vakhta/domain';
import { assertInScope, scopedEvents, scopeOf } from '../common/access-scope.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { HandoverChanges } from './handover-changes.js';
import { HandoverService } from './handover.service.js';
import { MediaService } from './media.service.js';

const VIEWERS = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'SHIFT_MASTER',
  'HR',
  'CLEANLINESS_CONTROLLER',
  'AUDITOR',
] as const;
const DECIDERS = ['ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'CLEANLINESS_CONTROLLER'] as const;

/** Панель «Чистота и передача» (ТЗ 9.1): черга приймань, спори, рішення, фото за підписаними посиланнями. */
@Controller('admin/handovers')
@UseGuards(WebAuthGuard)
@Roles(...VIEWERS)
export class AdminHandoverController {
  constructor(
    private readonly handovers: HandoverService,
    private readonly media: MediaService,
    private readonly changes: HandoverChanges,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(HandoverListQuery)) q: HandoverListQuery,
    @CurrentUser() user: WebUser,
  ): Promise<HandoverListItemView[]> {
    return this.handovers.list(q, new Date(), scopeOf(user, VIEWERS));
  }

  @Sse('stream')
  stream(@CurrentUser() user: WebUser): Observable<MessageEvent> {
    const events = scopedEvents(this.changes.stream(), scopeOf(user, VIEWERS), (e) =>
      this.handovers.handoverPlace(e.handoverId),
    );
    return merge(
      events.pipe(map((e) => ({ type: 'handover', data: e }) as MessageEvent)),
      interval(25_000).pipe(map(() => ({ type: 'ping', data: '' }) as MessageEvent)),
    );
  }

  @Get('media/:id/link')
  link(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<MediaLinkView> {
    return this.media.link(id, webUserActor(user));
  }

  @Get(':id')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<HandoverDetailView> {
    await this.assertHandover(user, VIEWERS, id);
    return this.handovers.detail(id);
  }

  private async assertHandover(user: WebUser, roles: readonly WebRole[], id: string) {
    const scope = scopeOf(user, roles);
    if (scope.all) return;
    const place = await this.handovers.handoverPlace(id);
    if (place) assertInScope(scope, place);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @Roles(...DECIDERS)
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResolveHandoverCommand)) body: ResolveHandoverCommand,
    @CurrentUser() user: WebUser,
  ): Promise<HandoverView> {
    await this.assertHandover(user, DECIDERS, id);
    return this.handovers.resolve(id, body, webUserActor(user));
  }
}
