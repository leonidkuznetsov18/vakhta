import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  AuditQuery,
  EventsQuery,
  LossesQuery,
  type AuditEntryView,
  type DomainEventView,
  type LossesView,
} from '@vakhta/contracts';
import { z } from 'zod';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { RequestLocale } from '../common/locale.decorator.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import type { Locale } from '@vakhta/domain';
import { LossesService } from './losses.service.js';
import { ReportsService } from './reports.service.js';

const Format = z.enum(['csv', 'xlsx']);

/** «Отчёты» і «Аудит» (ТЗ 9.1, 9.3, FR-WEB-04/05): агрегати за роллю, вивантаження в аудиті. */
@Controller('admin')
@UseGuards(WebAuthGuard)
export class AdminReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly lossesService: LossesService,
  ) {}

  @Get('reports/losses')
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'HR', 'ACCOUNTANT', 'AUDITOR', 'SHIFT_MASTER', 'PLANNER')
  losses(
    @Query(new ZodValidationPipe(LossesQuery)) q: LossesQuery,
    @RequestLocale() locale: Locale,
  ): Promise<LossesView> {
    return this.lossesService.overview(q, locale);
  }

  @Get('reports/losses/export/:format')
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'HR', 'ACCOUNTANT', 'AUDITOR')
  async exportLosses(
    @Param('format', new ZodValidationPipe(Format)) format: 'csv' | 'xlsx',
    @Query(new ZodValidationPipe(LossesQuery)) q: LossesQuery,
    @CurrentUser() user: WebUser,
    @RequestLocale() locale: Locale,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.lossesService.export(q, format, webUserActor(user), locale);
    await reply
      .header('content-type', file.contentType)
      .header('content-disposition', `attachment; filename="${file.filename}"`)
      .send(file.body);
  }

  @Get('audit')
  @Roles('ADMIN', 'AUDITOR', 'PRODUCTION_HEAD', 'HR')
  audit(@Query(new ZodValidationPipe(AuditQuery)) q: AuditQuery): Promise<AuditEntryView[]> {
    return this.reports.auditEntries(q);
  }

  @Get('audit/events')
  @Roles('ADMIN', 'AUDITOR', 'PRODUCTION_HEAD', 'HR', 'SHIFT_MASTER')
  events(@Query(new ZodValidationPipe(EventsQuery)) q: EventsQuery): Promise<DomainEventView[]> {
    return this.reports.events(q);
  }
}
