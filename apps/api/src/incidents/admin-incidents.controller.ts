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
} from '@vakhta/contracts';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { IncidentChanges } from './incident-changes.js';
import { IncidentsService } from './incidents.service.js';

const VIEWERS = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'SHIFT_MASTER',
  'HR',
  'PLANNER',
  'CLEANLINESS_CONTROLLER',
  'ACCOUNTANT',
  'AUDITOR',
] as const;
const MASTERS = ['ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER'] as const;

/** Екран майстра «Простои и инциденты» (ТЗ 9.1, FR-DWN-05). */
@Controller('admin/incidents')
@UseGuards(WebAuthGuard)
@Roles(...VIEWERS)
export class AdminIncidentsController {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly changes: IncidentChanges,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(IncidentsQuery)) q: IncidentsQuery): Promise<IncidentView[]> {
    return this.incidents.list(q);
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return merge(
      this.changes.stream().pipe(map((e) => ({ type: 'incident', data: e }) as MessageEvent)),
      interval(25_000).pipe(map(() => ({ type: 'ping', data: '' }) as MessageEvent)),
    );
  }

  @Get('stats')
  stats(
    @Query(new ZodValidationPipe(IncidentStatsQuery)) q: IncidentStatsQuery,
  ): Promise<IncidentStatsView> {
    return this.incidents.stats(q);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<IncidentDetailView> {
    return this.incidents.detail(id);
  }

  @Post(':id/transition')
  @HttpCode(200)
  @Roles(...MASTERS)
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(IncidentTransitionCommand)) body: IncidentTransitionCommand,
    @CurrentUser() user: WebUser,
  ): Promise<IncidentView> {
    return this.incidents.transition(id, body, webUserActor(user));
  }

  @Post(':id/update')
  @HttpCode(200)
  @Roles(...MASTERS)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(IncidentUpdateCommand)) body: IncidentUpdateCommand,
    @CurrentUser() user: WebUser,
  ): Promise<IncidentView> {
    return this.incidents.update(id, body, webUserActor(user));
  }
}
