import type { FastifyReply } from 'fastify';
import type { Locale } from '@vakhta/domain';
import { RequestLocale } from '../common/locale.decorator.js';
import { ScheduleExportService } from './schedule-export.service.js';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ScheduleHistoryQuery,
  ScheduleExportQuery,
  type ScheduleHistoryPage,
  ScheduleRevisionPrecondition,
  ScheduleWebCommand,
  type ScheduleCommandResult,
  CreateScheduleVersionCommand,
  CreateShiftTemplateCommand,
  ListScheduleVersionsQuery,
  PublishScheduleCommand,
  ReviseScheduleCommand,
  PutAssignmentsCommand,
  ReturnToDraftCommand,
  SavePatternCommand,
  type SchedulePatternView,
  CreateOpenSlotCommand,
  OfferSlotCommand,
  OpenSlotsQuery,
  SelectSlotCommand,
  type OpenSlotView,
  CreateScheduleNoteCommand,
  ScheduleNotesQuery,
  type ScheduleNoteView,
  RetrospectiveQuery,
  type RetrospectiveView,
  type AcknowledgementStatusView,
  type ScheduleVersionDetail,
  type ScheduleVersionView,
  type ShiftTemplateView,
  type RemindResult,
} from '@vakhta/contracts';
import {
  canActOn,
  SCHEDULE_APPROVE_ROLES,
  SCHEDULE_EDIT_ROLES,
  type ScopeTarget,
  type WebRole,
} from '@vakhta/domain';
import { z } from 'zod';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ScheduleService } from './schedule.service.js';
import { ScheduleCommandService } from './schedule-command.service.js';
import { TemplatesService } from './templates.service.js';
import { ScheduleHistoryService } from './schedule-history.service.js';
import { PatternsService } from './patterns.service.js';
import { OpenSlotsService } from './open-slots.service.js';
import { NotesService } from './notes.service.js';
import { RetrospectiveService } from './retrospective.service.js';

const ALL_PANEL_ROLES: WebRole[] = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'HR',
  'PLANNER',
  'SHIFT_MASTER',
  'CLEANLINESS_CONTROLLER',
  'ACCOUNTANT',
  'AUDITOR',
];
const EDITORS: WebRole[] = [...SCHEDULE_EDIT_ROLES];
const APPROVERS: WebRole[] = [...SCHEDULE_APPROVE_ROLES];
/** Reminder actions stay with unit-wide planning and approval roles. */
const REMINDERS: WebRole[] = ['ADMIN', 'PLANNER', 'PRODUCTION_HEAD'];

const SiteQuery = z.object({ siteId: z.uuid() });

/** Роль має покривати майданчик і підрозділ версії (FR-AUTH-03, ТЗ 2.1). */
function assertScope(user: WebUser, roles: WebRole[], target: ScopeTarget): void {
  if (!canActOn(user.grants, roles, target)) {
    throw new ForbiddenException('Немає прав на цей підрозділ');
  }
}

/** Планування місяця: версії, призначення, погодження, публікація (ТЗ 3, 9.1 «График»). */
@Controller('admin/schedules')
@UseGuards(WebAuthGuard)
@Roles(...ALL_PANEL_ROLES)
export class AdminSchedulesController {
  constructor(
    private readonly schedules: ScheduleService,
    private readonly templates: TemplatesService,
    private readonly commands: ScheduleCommandService,
    private readonly historyService: ScheduleHistoryService,
    private readonly exportService: ScheduleExportService,
    private readonly patterns: PatternsService,
    private readonly slots: OpenSlotsService,
    private readonly notes: NotesService,
    private readonly retrospective: RetrospectiveService,
  ) {}

  @Get('patterns')
  @Roles(...EDITORS, ...APPROVERS)
  listPatterns(
    @Query(new ZodValidationPipe(SiteQuery)) query: { siteId: string },
    @CurrentUser() user: WebUser,
  ): Promise<SchedulePatternView[]> {
    assertScope(user, [...EDITORS, ...APPROVERS], { siteId: query.siteId });
    return this.patterns.list(query.siteId);
  }

  @Post('patterns')
  @HttpCode(200)
  @Roles(...EDITORS)
  savePattern(
    @Body(new ZodValidationPipe(SavePatternCommand)) body: SavePatternCommand,
    @CurrentUser() user: WebUser,
  ): Promise<SchedulePatternView> {
    assertScope(user, EDITORS, { siteId: body.siteId });
    return this.patterns.save(body, webUserActor(user));
  }

  @Delete('patterns/:id')
  @HttpCode(204)
  @Roles(...EDITORS)
  async removePattern(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<void> {
    const siteId = await this.patterns.siteOf(id);
    assertScope(user, EDITORS, { siteId });
    await this.patterns.remove(id, webUserActor(user));
  }

  @Get('notes')
  listNotes(
    @Query(new ZodValidationPipe(ScheduleNotesQuery)) query: ScheduleNotesQuery,
    @CurrentUser() user: WebUser,
  ): Promise<ScheduleNoteView[]> {
    assertScope(user, ALL_PANEL_ROLES, query);
    return this.notes.list(query);
  }

  @Post('notes')
  @HttpCode(200)
  @Roles(...EDITORS, ...APPROVERS)
  createNote(
    @Body(new ZodValidationPipe(CreateScheduleNoteCommand)) body: CreateScheduleNoteCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ScheduleNoteView> {
    assertScope(user, [...EDITORS, ...APPROVERS], {
      siteId: body.siteId,
      orgUnitId: body.orgUnitId,
    });
    return this.notes.create(body, webUserActor(user));
  }

  @Delete('notes/:id')
  @HttpCode(204)
  @Roles(...EDITORS, ...APPROVERS)
  async removeNote(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<void> {
    const scope = await this.notes.scopeOf(id);
    assertScope(user, [...EDITORS, ...APPROVERS], scope);
    if (scope.createdBy !== user.id && !canActOn(user.grants, APPROVERS, scope))
      throw new ForbiddenException('Only the author or an approver removes a note');
    await this.notes.remove(id, webUserActor(user));
  }

  @Get('reports/retrospective')
  retrospectiveView(
    @Query(new ZodValidationPipe(RetrospectiveQuery)) query: RetrospectiveQuery,
    @CurrentUser() user: WebUser,
  ): Promise<RetrospectiveView> {
    assertScope(user, ALL_PANEL_ROLES, query);
    return this.retrospective.view(query);
  }

  @Get('reports/retrospective/export')
  async retrospectiveExport(
    @Query(new ZodValidationPipe(RetrospectiveQuery)) query: RetrospectiveQuery,
    @CurrentUser() user: WebUser,
    @RequestLocale() locale: Locale,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    assertScope(user, ALL_PANEL_ROLES, query);
    const file = await this.retrospective.export(query, user, locale);
    await reply
      .header('content-type', file.contentType)
      .header('content-disposition', `attachment; filename="${file.filename}"`)
      .header('cache-control', 'private, no-store')
      .send(file.body);
  }

  @Get('open-slots')
  @Roles(...EDITORS, ...APPROVERS)
  listOpenSlots(
    @Query(new ZodValidationPipe(OpenSlotsQuery)) query: OpenSlotsQuery,
    @CurrentUser() user: WebUser,
  ): Promise<OpenSlotView[]> {
    assertScope(user, [...EDITORS, ...APPROVERS], query);
    return this.slots.list(query);
  }

  @Post('open-slots')
  @HttpCode(200)
  @Roles(...EDITORS)
  createOpenSlot(
    @Body(new ZodValidationPipe(CreateOpenSlotCommand)) body: CreateOpenSlotCommand,
    @CurrentUser() user: WebUser,
  ): Promise<OpenSlotView> {
    assertScope(user, EDITORS, body);
    return this.slots.create(body, webUserActor(user));
  }

  @Post('open-slots/:id/offer')
  @HttpCode(200)
  @Roles(...EDITORS)
  async offerOpenSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(OfferSlotCommand)) body: OfferSlotCommand,
    @CurrentUser() user: WebUser,
  ): Promise<OpenSlotView> {
    assertScope(user, EDITORS, await this.slots.scopeOf(id));
    return this.slots.offer(id, body, webUserActor(user));
  }

  @Post('open-slots/:id/withdraw')
  @HttpCode(200)
  @Roles(...EDITORS)
  async withdrawOpenSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<OpenSlotView> {
    assertScope(user, EDITORS, await this.slots.scopeOf(id));
    return this.slots.withdraw(id, webUserActor(user));
  }

  @Post('open-slots/:id/cancel')
  @HttpCode(200)
  @Roles(...EDITORS)
  async cancelOpenSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<OpenSlotView> {
    assertScope(user, EDITORS, await this.slots.scopeOf(id));
    return this.slots.cancel(id, webUserActor(user));
  }

  @Post('open-slots/:id/select')
  @HttpCode(200)
  @Roles(...EDITORS)
  async selectOpenSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SelectSlotCommand)) body: SelectSlotCommand,
    @CurrentUser() user: WebUser,
  ): Promise<{ slot: OpenSlotView; detail: ScheduleVersionDetail }> {
    assertScope(user, EDITORS, await this.slots.scopeOf(id));
    return this.slots.select(id, body, webUserActor(user), user.grants);
  }

  @Post('commands')
  @HttpCode(200)
  @Roles(...EDITORS, ...APPROVERS)
  command(
    @Body(new ZodValidationPipe(ScheduleWebCommand)) body: ScheduleWebCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ScheduleCommandResult> {
    return this.commands.execute(body, user);
  }

  @Get('templates')
  listTemplates(
    @Query(new ZodValidationPipe(SiteQuery)) q: { siteId: string },
  ): Promise<ShiftTemplateView[]> {
    return this.templates.list(q.siteId);
  }

  @Post('templates')
  @HttpCode(201)
  @Roles('ADMIN')
  createTemplate(
    @Body(new ZodValidationPipe(CreateShiftTemplateCommand)) body: CreateShiftTemplateCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ShiftTemplateView> {
    return this.templates.create(body, webUserActor(user));
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(ListScheduleVersionsQuery)) q: ListScheduleVersionsQuery,
  ): Promise<ScheduleVersionView[]> {
    return this.schedules.list(q);
  }

  @Post()
  @HttpCode(201)
  @Roles(...EDITORS)
  async create(
    @Body(new ZodValidationPipe(CreateScheduleVersionCommand)) body: CreateScheduleVersionCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ScheduleVersionView> {
    await this.schedules.editorScope(user.grants, body, 'CREATE');
    return this.schedules.createVersion(body, webUserActor(user));
  }

  @Get(':id/export')
  async export(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ScheduleExportQuery)) query: ScheduleExportQuery,
    @CurrentUser() user: WebUser,
    @RequestLocale() locale: Locale,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const version = await this.schedules.requireVersion(id);
    assertScope(user, ALL_PANEL_ROLES, { siteId: version.siteId, orgUnitId: version.orgUnitId });
    const file = await this.exportService.export(id, query, user, locale);
    await reply
      .header('content-type', file.contentType)
      .header('content-disposition', `attachment; filename="${file.filename}"`)
      .header('cache-control', 'private, no-store')
      .send(file.body);
  }

  @Get(':id/history')
  async history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ScheduleHistoryQuery)) query: ScheduleHistoryQuery,
    @CurrentUser() user: WebUser,
  ): Promise<ScheduleHistoryPage> {
    const version = await this.schedules.requireVersion(id);
    assertScope(user, ALL_PANEL_ROLES, { siteId: version.siteId, orgUnitId: version.orgUnitId });
    return this.historyService.history(id, query);
  }

  @Get(':id')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<ScheduleVersionDetail> {
    const detail = await this.schedules.detail(id);
    assertScope(user, ALL_PANEL_ROLES, {
      siteId: detail.version.siteId,
      orgUnitId: detail.version.orgUnitId,
    });
    return detail;
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...EDITORS)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ScheduleRevisionPrecondition)) body: ScheduleRevisionPrecondition,
    @CurrentUser() user: WebUser,
  ): Promise<void> {
    const detail = await this.schedules.detail(id);
    await this.schedules.editorScope(user.grants, detail.version, 'DELETE');
    await this.schedules.deleteVersion(id, webUserActor(user), body.expectedRevision);
  }

  @Put(':id/assignments')
  @Roles(...EDITORS)
  async putAssignments(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(PutAssignmentsCommand.extend(ScheduleRevisionPrecondition.shape)))
    body: PutAssignmentsCommand & ScheduleRevisionPrecondition,
    @CurrentUser() user: WebUser,
  ): Promise<ScheduleVersionDetail> {
    const version = await this.schedules.requireVersion(id);
    const restriction = await this.schedules.editorScope(user.grants, version, 'SAVE');
    await this.schedules.assertBorrowingAuthority(user.grants, version, body.items);
    return this.schedules.putAssignments(
      id,
      body,
      webUserActor(user),
      body.expectedRevision,
      restriction,
    );
  }

  @Post(':id/submit')
  @HttpCode(200)
  @Roles(...EDITORS)
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ScheduleRevisionPrecondition)) body: ScheduleRevisionPrecondition,
    @CurrentUser() user: WebUser,
  ): Promise<ScheduleVersionView> {
    const version = await this.schedules.requireVersion(id);
    await this.schedules.editorScope(user.grants, version, 'SUBMIT');
    return this.schedules.submit(id, webUserActor(user), body.expectedRevision);
  }

  @Post(':id/return')
  @HttpCode(200)
  @Roles(...APPROVERS)
  async returnToDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReturnToDraftCommand.extend(ScheduleRevisionPrecondition.shape)))
    body: ReturnToDraftCommand & ScheduleRevisionPrecondition,
    @CurrentUser() user: WebUser,
  ): Promise<ScheduleVersionView> {
    const version = await this.schedules.requireVersion(id);
    assertScope(user, APPROVERS, { siteId: version.siteId, orgUnitId: version.orgUnitId });
    return this.schedules.returnToDraft(id, body, webUserActor(user), body.expectedRevision);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Roles(...APPROVERS)
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(PublishScheduleCommand.extend(ScheduleRevisionPrecondition.shape)))
    body: PublishScheduleCommand & ScheduleRevisionPrecondition,
    @CurrentUser() user: WebUser,
  ): Promise<ScheduleVersionView> {
    const version = await this.schedules.requireVersion(id);
    assertScope(user, APPROVERS, { siteId: version.siteId, orgUnitId: version.orgUnitId });
    return this.schedules.publish(id, body, webUserActor(user), body.expectedRevision);
  }

  @Post(':id/revise')
  @HttpCode(200)
  @Roles(...APPROVERS)
  async revise(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReviseScheduleCommand.extend(ScheduleRevisionPrecondition.shape)))
    body: ReviseScheduleCommand & ScheduleRevisionPrecondition,
    @CurrentUser() user: WebUser,
  ): Promise<ScheduleVersionView> {
    const version = await this.schedules.requireVersion(id);
    assertScope(user, APPROVERS, { siteId: version.siteId, orgUnitId: version.orgUnitId });
    await this.schedules.assertBorrowingAuthority(user.grants, version, body.items);
    return this.schedules.revise(id, body, webUserActor(user), body.expectedRevision);
  }

  @Post(':id/remind')
  @Roles(...REMINDERS)
  async remind(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<RemindResult> {
    const detail = await this.schedules.detail(id);
    assertScope(user, REMINDERS, {
      siteId: detail.version.siteId,
      orgUnitId: detail.version.orgUnitId,
    });
    return this.schedules.remindAcknowledgement(id, webUserActor(user));
  }

  @Get(':id/acknowledgements')
  async acknowledgements(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<AcknowledgementStatusView[]> {
    const version = await this.schedules.requireVersion(id);
    assertScope(user, ALL_PANEL_ROLES, { siteId: version.siteId, orgUnitId: version.orgUnitId });
    return this.schedules.acknowledgementStatus(id);
  }
}
