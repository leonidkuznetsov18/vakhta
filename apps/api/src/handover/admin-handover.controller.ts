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
  ): Promise<HandoverListItemView[]> {
    return this.handovers.list(q);
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return merge(
      this.changes.stream().pipe(map((e) => ({ type: 'handover', data: e }) as MessageEvent)),
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
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<HandoverDetailView> {
    return this.handovers.detail(id);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @Roles(...DECIDERS)
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResolveHandoverCommand)) body: ResolveHandoverCommand,
    @CurrentUser() user: WebUser,
  ): Promise<HandoverView> {
    return this.handovers.resolve(id, body, webUserActor(user));
  }
}
