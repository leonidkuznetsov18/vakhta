import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  CalendarQuery,
  DocumentUploadQuery,
  EmergencyCreateCommand,
  EquipmentInput,
  EquipmentQuery,
  EquipmentUpdate,
  PlanSaveCommand,
  PlanStateCommand,
  ReasonCommand,
  ReassignCommand,
  ReleaseCommand,
  ReplanCommand,
  ReviewCommand,
  WorkQuery,
} from '@vakhta/contracts';
import type { WebRole } from '@vakhta/domain';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { assertInScope, scopeOf } from '../common/access-scope.js';
import { DomainError } from '../common/domain-error.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { MAINTENANCE_MANAGERS, MAINTENANCE_RESPONDERS, MAINTENANCE_VIEWERS } from './access.js';
import { DocumentsService, MAX_DOCUMENT_BYTES } from './documents.service.js';
import { EmergencyService } from './emergency.service.js';
import { EquipmentService } from './equipment.service.js';
import { PlansService } from './plans.service.js';
import { WorkActionsService } from './work-actions.service.js';
import { WorkQueriesService } from './work-queries.service.js';

/** Panel API of equipment maintenance (spec 014). Every record is checked against the scope. */
@Controller('admin/maintenance')
@UseGuards(WebAuthGuard)
@Roles(...MAINTENANCE_VIEWERS)
export class MaintenanceController {
  constructor(
    private readonly equipment: EquipmentService,
    private readonly documents: DocumentsService,
    private readonly plans: PlansService,
    private readonly queries: WorkQueriesService,
    private readonly actions: WorkActionsService,
    private readonly emergency: EmergencyService,
  ) {}

  private async inScope(user: WebUser, roles: readonly WebRole[], equipmentId: string) {
    const scope = scopeOf(user, roles);
    const place = await this.equipment.place(equipmentId);
    if (!place) throw new DomainError('EQUIPMENT_NOT_FOUND', 404, 'Equipment not found');
    if (!scope.all) assertInScope(scope, place);
  }

  private async workInScope(user: WebUser, roles: readonly WebRole[], workOrderId: string) {
    const scope = scopeOf(user, roles);
    const place = await this.queries.place(workOrderId);
    if (!place) throw new DomainError('WORK_NOT_FOUND', 404, 'Work order not found');
    if (!scope.all) assertInScope(scope, place);
  }

  private context(user: WebUser) {
    return { actor: webUserActor(user), source: 'WEB' as const, now: new Date() };
  }

  @Get('summary')
  summary(@CurrentUser() user: WebUser) {
    return this.queries.summary(scopeOf(user, MAINTENANCE_VIEWERS), new Date());
  }

  @Get('mechanics')
  mechanics() {
    return this.equipment.mechanics();
  }

  @Get('equipment')
  list(
    @Query(new ZodValidationPipe(EquipmentQuery)) q: EquipmentQuery,
    @CurrentUser() user: WebUser,
  ) {
    return this.equipment.list(q, scopeOf(user, MAINTENANCE_VIEWERS), new Date());
  }

  @Get('equipment/:id')
  async detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: WebUser) {
    await this.inScope(user, MAINTENANCE_VIEWERS, id);
    return this.equipment.detail(id, new Date());
  }

  @Post('equipment')
  @Roles(...MAINTENANCE_MANAGERS)
  create(
    @Body(new ZodValidationPipe(EquipmentInput)) body: EquipmentInput,
    @CurrentUser() user: WebUser,
  ) {
    const scope = scopeOf(user, MAINTENANCE_MANAGERS);
    if (!scope.all) assertInScope(scope, { orgUnitId: body.orgUnitId });
    return this.equipment.create(body, webUserActor(user));
  }

  @Put('equipment/:id')
  @Roles(...MAINTENANCE_MANAGERS)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(EquipmentUpdate)) body: EquipmentUpdate,
    @CurrentUser() user: WebUser,
  ) {
    await this.inScope(user, MAINTENANCE_MANAGERS, id);
    return this.equipment.update(id, body, webUserActor(user));
  }

  @Post('equipment/:id/archive')
  @Roles(...MAINTENANCE_MANAGERS)
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReasonCommand)) body: ReasonCommand,
    @CurrentUser() user: WebUser,
  ) {
    await this.inScope(user, MAINTENANCE_MANAGERS, id);
    return this.equipment.archive(id, body.reason, webUserActor(user));
  }

  @Get('documents')
  @Roles(...MAINTENANCE_MANAGERS)
  library() {
    return this.documents.library();
  }

  @Post('equipment/:id/documents')
  @Roles(...MAINTENANCE_MANAGERS)
  async upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: FastifyRequest,
    @CurrentUser() user: WebUser,
  ) {
    // Metadata travels in the query string next to the multipart file.
    const meta = new ZodValidationPipe(DocumentUploadQuery).transform(request.query);
    await this.inScope(user, MAINTENANCE_MANAGERS, id);
    const file = await request.file({ limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } });
    if (!file) throw new DomainError('DOCUMENT_INVALID', 400, 'A file is required');
    let bytes: Buffer;
    try {
      bytes = await file.toBuffer();
    } catch {
      throw new DomainError('DOCUMENT_TOO_LARGE', 413, 'Document exceeds 50 MiB');
    }
    return this.documents.upload(id, { meta, bytes }, webUserActor(user));
  }

  @Post('equipment/:id/documents/:documentId')
  @Roles(...MAINTENANCE_MANAGERS)
  async attach(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: WebUser,
  ) {
    await this.inScope(user, MAINTENANCE_MANAGERS, id);
    return this.documents.attach(id, documentId, webUserActor(user));
  }

  @Delete('equipment/:id/documents/:documentId')
  @Roles(...MAINTENANCE_MANAGERS)
  async unlink(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: WebUser,
  ) {
    await this.inScope(user, MAINTENANCE_MANAGERS, id);
    return this.documents.unlink(id, documentId, webUserActor(user));
  }

  /** A short-lived link; the reader must see one of the machines the document belongs to. */
  @Get('documents/:documentId/link')
  async documentLink(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: WebUser,
  ) {
    const machines = await this.documents.equipmentOf(documentId);
    const scope = scopeOf(user, MAINTENANCE_VIEWERS);
    if (!scope.all) {
      const places = await Promise.all(machines.map((id) => this.equipment.place(id)));
      if (!places.some((place) => place && tryScope(scope, place)))
        throw new DomainError('OUT_OF_SCOPE', 403, 'The record is outside your access scope');
    }
    return this.documents.link(documentId);
  }

  @Post('equipment/:id/plans')
  @Roles(...MAINTENANCE_MANAGERS)
  async createPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(PlanSaveCommand)) body: PlanSaveCommand,
    @CurrentUser() user: WebUser,
  ) {
    await this.inScope(user, MAINTENANCE_MANAGERS, id);
    return this.plans.create(id, body, webUserActor(user));
  }

  @Get('plans/:planId')
  async plan(@Param('planId', ParseUUIDPipe) planId: string, @CurrentUser() user: WebUser) {
    await this.inScope(user, MAINTENANCE_VIEWERS, await this.plans.equipmentOf(planId));
    return this.plans.detail(planId);
  }

  @Put('plans/:planId')
  @Roles(...MAINTENANCE_MANAGERS)
  async savePlan(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body(new ZodValidationPipe(PlanSaveCommand)) body: PlanSaveCommand,
    @CurrentUser() user: WebUser,
  ) {
    await this.inScope(user, MAINTENANCE_MANAGERS, await this.plans.equipmentOf(planId));
    return this.plans.save(planId, body, webUserActor(user));
  }

  @Post('plans/:planId/publish')
  @Roles(...MAINTENANCE_MANAGERS)
  async publish(@Param('planId', ParseUUIDPipe) planId: string, @CurrentUser() user: WebUser) {
    await this.inScope(user, MAINTENANCE_MANAGERS, await this.plans.equipmentOf(planId));
    return this.plans.publish(planId, webUserActor(user));
  }

  @Post('plans/:planId/state')
  @Roles(...MAINTENANCE_MANAGERS)
  async planState(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body(new ZodValidationPipe(PlanStateCommand)) body: PlanStateCommand,
    @CurrentUser() user: WebUser,
  ) {
    await this.inScope(user, MAINTENANCE_MANAGERS, await this.plans.equipmentOf(planId));
    return this.plans.setState(
      planId,
      { state: body.state, reason: body.reason ?? null },
      webUserActor(user),
    );
  }

  @Get('work')
  work(@Query(new ZodValidationPipe(WorkQuery)) q: WorkQuery, @CurrentUser() user: WebUser) {
    return this.queries.list(q, scopeOf(user, MAINTENANCE_VIEWERS), new Date());
  }

  @Get('calendar')
  calendar(
    @Query(new ZodValidationPipe(CalendarQuery)) q: CalendarQuery,
    @CurrentUser() user: WebUser,
  ) {
    return this.queries.calendar(q, scopeOf(user, MAINTENANCE_VIEWERS), new Date());
  }

  @Get('work/:id')
  async workDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: WebUser) {
    await this.workInScope(user, MAINTENANCE_VIEWERS, id);
    return this.queries.detail(id, new Date());
  }

  @Post('work/:id/review')
  @Roles(...MAINTENANCE_MANAGERS)
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReviewCommand)) body: ReviewCommand,
    @CurrentUser() user: WebUser,
  ) {
    await this.workInScope(user, MAINTENANCE_MANAGERS, id);
    return this.actions.review(id, body, this.context(user));
  }

  @Post('work/:id/replan')
  @Roles(...MAINTENANCE_MANAGERS)
  async replan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReplanCommand)) body: ReplanCommand,
    @CurrentUser() user: WebUser,
  ) {
    await this.workInScope(user, MAINTENANCE_MANAGERS, id);
    return this.actions.replan(id, body, this.context(user));
  }

  @Post('work/:id/cancel')
  @Roles(...MAINTENANCE_MANAGERS)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReasonCommand)) body: ReasonCommand,
    @CurrentUser() user: WebUser,
  ) {
    await this.workInScope(user, MAINTENANCE_MANAGERS, id);
    return this.actions.cancel(id, body.reason, this.context(user));
  }

  @Post('work/:id/reassign')
  @Roles(...MAINTENANCE_RESPONDERS)
  async reassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReassignCommand)) body: ReassignCommand,
    @CurrentUser() user: WebUser,
  ) {
    await this.workInScope(user, MAINTENANCE_RESPONDERS, id);
    return this.actions.reassign(id, body, this.context(user));
  }

  @Post('equipment/:id/emergency')
  @Roles(...MAINTENANCE_RESPONDERS)
  async createEmergency(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(EmergencyCreateCommand)) body: EmergencyCreateCommand,
    @CurrentUser() user: WebUser,
  ) {
    await this.inScope(user, MAINTENANCE_RESPONDERS, id);
    return this.emergency.createFromPanel(id, body, { actor: webUserActor(user), now: new Date() });
  }

  @Post('equipment/:id/release')
  @Roles(...MAINTENANCE_RESPONDERS)
  async release(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReleaseCommand)) body: ReleaseCommand,
    @CurrentUser() user: WebUser,
  ) {
    await this.inScope(user, MAINTENANCE_RESPONDERS, id);
    return this.emergency.release(id, body, { actor: webUserActor(user), now: new Date() });
  }
}

function tryScope(
  scope: Parameters<typeof assertInScope>[0],
  place: Parameters<typeof assertInScope>[1],
): boolean {
  try {
    assertInScope(scope, place);
    return true;
  } catch {
    return false;
  }
}
