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
import type { WebRole } from '@vakhta/domain';
import { assertInScope, scopedEvents, scopeOf } from '../common/access-scope.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { CorrectionsService } from './corrections.service.js';
import { RequestChanges } from './request-changes.js';
import { RequestsService, type Decider } from './requests.service.js';

const VIEWERS: readonly WebRole[] = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'SHIFT_MASTER',
  'HR',
  'PLANNER',
  'AUDITOR',
];
const DECIDERS: readonly WebRole[] = ['ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'HR'];

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
    return this.requests.list(q, decider(user), new Date(), scopeOf(user, VIEWERS));
  }

  @Sse('stream')
  stream(@CurrentUser() user: WebUser): Observable<MessageEvent> {
    const events = scopedEvents(this.changes.stream(), scopeOf(user, VIEWERS), (e) =>
      this.requests.requestPlace(e.requestId),
    );
    return merge(
      events.pipe(map((e) => ({ type: 'request', data: e }) as MessageEvent)),
      interval(25_000).pipe(map(() => ({ type: 'ping', data: '' }) as MessageEvent)),
    );
  }

  @Get('overtime')
  overtime(
    @Query('scope') scope: string | undefined,
    @CurrentUser() user: WebUser,
  ): Promise<OvertimeView[]> {
    return this.requests.overtime(scope === 'all' ? 'all' : 'pending', scopeOf(user, VIEWERS));
  }

  @Post('overtime/:sessionId/decide')
  @HttpCode(200)
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER')
  async decideOvertime(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body(new ZodValidationPipe(DecideOvertimeCommand)) body: DecideOvertimeCommand,
    @CurrentUser() user: WebUser,
  ): Promise<OvertimeView> {
    const scope = scopeOf(user, ['ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER']);
    if (!scope.all) {
      const place = await this.requests.sessionPlace(sessionId);
      if (place) assertInScope(scope, place);
    }
    return this.requests.decideOvertime(sessionId, body, webUserActor(user));
  }

  @Post('corrections/:sessionId')
  @HttpCode(200)
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER')
  async correct(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body(new ZodValidationPipe(ApplyCorrectionCommand)) body: ApplyCorrectionCommand,
    @CurrentUser() user: WebUser,
  ): Promise<CorrectionResultView> {
    const scope = scopeOf(user, ['ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER']);
    if (!scope.all) {
      const place = await this.requests.sessionPlace(sessionId);
      if (place) assertInScope(scope, place);
    }
    return this.corrections.apply(sessionId, body, webUserActor(user));
  }

  @Get(':id')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<RequestDetailView> {
    await this.assertRequest(user, VIEWERS, id);
    return this.requests.detail(id, decider(user));
  }

  @Get(':id/medical/link')
  async medical(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<MediaLinkView> {
    await this.assertRequest(user, VIEWERS, id);
    return this.requests.medicalLink(id, decider(user));
  }

  @Post(':id/decide')
  @HttpCode(200)
  @Roles(...DECIDERS)
  async decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DecideRequestCommand)) body: DecideRequestCommand,
    @CurrentUser() user: WebUser,
  ): Promise<RequestView> {
    await this.assertRequest(user, DECIDERS, id);
    return this.requests.decide(id, body, decider(user));
  }

  private async assertRequest(user: WebUser, roles: readonly WebRole[], id: string) {
    const scope = scopeOf(user, roles);
    if (scope.all) return;
    const place = await this.requests.requestPlace(id);
    if (place) assertInScope(scope, place);
  }
}
