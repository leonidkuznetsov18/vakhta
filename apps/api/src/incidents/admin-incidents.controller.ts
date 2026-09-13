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
  IncidentStatsQuery,
  IncidentTransitionCommand,
  IncidentUpdateCommand,
  IncidentsQuery,
  type IncidentDetailView,
  type IncidentStatsView,
  type IncidentView,
  type MediaLinkView,
} from '@vakhta/contracts';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { RequestLocale } from '../common/locale.decorator.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import type { Locale, WebRole } from '@vakhta/domain';
import { assertInScope, scopedEvents, scopeOf } from '../common/access-scope.js';
import { MediaService } from '../handover/media.service.js';
import { IncidentChanges } from './incident-changes.js';
import { IncidentsService } from './incidents.service.js';

const VIEWERS: readonly WebRole[] = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'SHIFT_MASTER',
  'HR',
  'PLANNER',
  'CLEANLINESS_CONTROLLER',
  'ACCOUNTANT',
  'AUDITOR',
];
const MASTERS: readonly WebRole[] = ['ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER'];

/** Екран майстра «Простои и инциденты» (ТЗ 9.1, FR-DWN-05). */
@Controller('admin/incidents')
@UseGuards(WebAuthGuard)
@Roles(...VIEWERS)
export class AdminIncidentsController {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly changes: IncidentChanges,
    private readonly media: MediaService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(IncidentsQuery)) q: IncidentsQuery,
    @CurrentUser() user: WebUser,
  ): Promise<IncidentView[]> {
    return this.incidents.list(q, new Date(), scopeOf(user, VIEWERS));
  }

  @Sse('stream')
  stream(@CurrentUser() user: WebUser): Observable<MessageEvent> {
    const events = scopedEvents(this.changes.stream(), scopeOf(user, VIEWERS), (e) =>
      this.incidents.incidentPlace(e.incidentId),
    );
    return merge(
      events.pipe(map((e) => ({ type: 'incident', data: e }) as MessageEvent)),
      interval(25_000).pipe(map(() => ({ type: 'ping', data: '' }) as MessageEvent)),
    );
  }

  @Get('stats')
  stats(
    @Query(new ZodValidationPipe(IncidentStatsQuery)) q: IncidentStatsQuery,
    @RequestLocale() locale: Locale,
    @CurrentUser() user: WebUser,
  ): Promise<IncidentStatsView> {
    return this.incidents.stats(q, locale, new Date(), scopeOf(user, VIEWERS));
  }

  /** The photo of a report, behind a signed short-lived link like every other photo (FR-PHO-06). */
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
  ): Promise<IncidentDetailView> {
    await this.assertIncident(user, VIEWERS, id);
    return this.incidents.detail(id);
  }

  private async assertIncident(user: WebUser, roles: readonly WebRole[], id: string) {
    const scope = scopeOf(user, roles);
    if (scope.all) return;
    const place = await this.incidents.incidentPlace(id);
    if (place) assertInScope(scope, place);
  }

  @Post(':id/transition')
  @HttpCode(200)
  @Roles(...MASTERS)
  async transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(IncidentTransitionCommand)) body: IncidentTransitionCommand,
    @CurrentUser() user: WebUser,
  ): Promise<IncidentView> {
    await this.assertIncident(user, MASTERS, id);
    return this.incidents.transition(id, body, webUserActor(user));
  }

  @Post(':id/update')
  @HttpCode(200)
  @Roles(...MASTERS)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(IncidentUpdateCommand)) body: IncidentUpdateCommand,
    @CurrentUser() user: WebUser,
  ): Promise<IncidentView> {
    await this.assertIncident(user, MASTERS, id);
    return this.incidents.update(id, body, webUserActor(user));
  }
}
