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
  ApplyCorrectionCommand,
  DecideOvertimeCommand,
  DecideRequestCommand,
  RequestsQuery,
  type CorrectionResultView,
  type MediaLinkView,
  type OvertimeView,
  type RequestDetailView,
  type RequestView,
} from '@vakhta/contracts';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { CorrectionsService } from './corrections.service.js';
import { RequestChanges } from './request-changes.js';
import { RequestsService, type Decider } from './requests.service.js';

const VIEWERS = ['ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'HR', 'PLANNER', 'AUDITOR'] as const;
const DECIDERS = ['ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'HR'] as const;

function decider(user: WebUser): Decider {
  return { ...webUserActor(user), roles: user.grants.map((g) => g.role) };
}

/** Панель «Обращения» (ТЗ 9.1): вхідні за роллю, рішення з коментарем, переробка, корекції, медичні документи для HR. */
@Controller('admin/requests')
@UseGuards(WebAuthGuard)
@Roles(...VIEWERS)
export class AdminRequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly corrections: CorrectionsService,
    private readonly changes: RequestChanges,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(RequestsQuery)) q: RequestsQuery,
    @CurrentUser() user: WebUser,
  ): Promise<RequestView[]> {
    return this.requests.list(q, decider(user));
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return merge(
      this.changes.stream().pipe(map((e) => ({ type: 'request', data: e }) as MessageEvent)),
      interval(25_000).pipe(map(() => ({ type: 'ping', data: '' }) as MessageEvent)),
    );
  }

  @Get('overtime')
  overtime(@Query('scope') scope?: string): Promise<OvertimeView[]> {
    return this.requests.overtime(scope === 'all' ? 'all' : 'pending');
  }

  @Post('overtime/:sessionId/decide')
  @HttpCode(200)
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER')
  decideOvertime(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body(new ZodValidationPipe(DecideOvertimeCommand)) body: DecideOvertimeCommand,
    @CurrentUser() user: WebUser,
  ): Promise<OvertimeView> {
    return this.requests.decideOvertime(sessionId, body, webUserActor(user));
  }

  @Post('corrections/:sessionId')
  @HttpCode(200)
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER')
  correct(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body(new ZodValidationPipe(ApplyCorrectionCommand)) body: ApplyCorrectionCommand,
    @CurrentUser() user: WebUser,
  ): Promise<CorrectionResultView> {
    return this.corrections.apply(sessionId, body, webUserActor(user));
  }

  @Get(':id')
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<RequestDetailView> {
    return this.requests.detail(id, decider(user));
  }

  @Get(':id/medical/link')
  medical(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<MediaLinkView> {
    return this.requests.medicalLink(id, decider(user));
  }

  @Post(':id/decide')
  @HttpCode(200)
  @Roles(...DECIDERS)
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DecideRequestCommand)) body: DecideRequestCommand,
    @CurrentUser() user: WebUser,
  ): Promise<RequestView> {
    return this.requests.decide(id, body, decider(user));
  }
}
