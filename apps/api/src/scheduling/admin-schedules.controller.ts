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
  UseGuards,
} from '@nestjs/common';
import {
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
  type AcknowledgementStatusView,
  type ScheduleVersionDetail,
  type ScheduleVersionView,
  type ShiftTemplateView,
  type RemindResult,
} from '@vakhta/contracts';
import { canActOn, type ScopeTarget, type WebRole } from '@vakhta/domain';
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
const EDITORS: WebRole[] = ['ADMIN', 'PLANNER'];
const APPROVERS: WebRole[] = ['ADMIN', 'PRODUCTION_HEAD'];

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
  ) {}

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
  create(
    @Body(new ZodValidationPipe(CreateScheduleVersionCommand)) body: CreateScheduleVersionCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ScheduleVersionView> {
    assertScope(user, EDITORS, { siteId: body.siteId, orgUnitId: body.orgUnitId });
    return this.schedules.createVersion(body, webUserActor(user));
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
    assertScope(user, EDITORS, {
      siteId: detail.version.siteId,
      orgUnitId: detail.version.orgUnitId,
    });
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
    assertScope(user, EDITORS, { siteId: version.siteId, orgUnitId: version.orgUnitId });
    return this.schedules.putAssignments(id, body, webUserActor(user), body.expectedRevision);
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
    assertScope(user, EDITORS, { siteId: version.siteId, orgUnitId: version.orgUnitId });
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
    return this.schedules.revise(id, body, webUserActor(user), body.expectedRevision);
  }

  @Post(':id/remind')
  @Roles(...EDITORS, ...APPROVERS)
  async remind(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<RemindResult> {
    const detail = await this.schedules.detail(id);
    assertScope(user, [...EDITORS, ...APPROVERS], {
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
