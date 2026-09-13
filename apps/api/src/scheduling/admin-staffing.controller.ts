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
  CreateQualificationCommand,
  RecordEmployeeQualificationCommand,
  SetStaffingRequirementCommand,
  StaffingQuery,
  type EmployeeQualificationView,
  type QualificationView,
  type StaffingRequirementView,
  type StaffingView,
} from '@vakhta/contracts';
import { canActOn, type ScopeTarget, type WebRole } from '@vakhta/domain';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { StaffingService } from './staffing.service.js';

const READERS: WebRole[] = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'HR',
  'PLANNER',
  'SHIFT_MASTER',
  'CLEANLINESS_CONTROLLER',
  'ACCOUNTANT',
  'AUDITOR',
];
/** D-02: administrators and production heads own demand; administrators and HR own evidence. */
const DEMAND_OWNERS: WebRole[] = ['ADMIN', 'PRODUCTION_HEAD'];
const EVIDENCE_OWNERS: WebRole[] = ['ADMIN', 'HR'];

function assertScope(user: WebUser, roles: WebRole[], target: ScopeTarget): void {
  if (!canActOn(user.grants, roles, target))
    throw new ForbiddenException('Staffing configuration is outside the current role scope');
}

/** Staffing demand, qualification catalog and holdings for the planning calendar (SC-01, SC-04). */
@Controller('admin/schedules/staffing')
@UseGuards(WebAuthGuard)
@Roles(...READERS)
export class AdminStaffingController {
  constructor(private readonly staffing: StaffingService) {}

  @Get()
  view(
    @Query(new ZodValidationPipe(StaffingQuery)) query: StaffingQuery,
    @CurrentUser() user: WebUser,
  ): Promise<StaffingView> {
    assertScope(user, READERS, query);
    return this.staffing.view(query.siteId, query.orgUnitId);
  }

  @Post('qualifications')
  @HttpCode(201)
  @Roles(...DEMAND_OWNERS, 'HR')
  createQualification(
    @Body(new ZodValidationPipe(CreateQualificationCommand)) body: CreateQualificationCommand,
    @CurrentUser() user: WebUser,
  ): Promise<QualificationView> {
    assertScope(user, [...DEMAND_OWNERS, 'HR'], { siteId: body.siteId });
    return this.staffing.createQualification(body, webUserActor(user));
  }

  @Post('holdings')
  @HttpCode(201)
  @Roles(...EVIDENCE_OWNERS)
  async recordHolding(
    @Body(new ZodValidationPipe(RecordEmployeeQualificationCommand))
    body: RecordEmployeeQualificationCommand,
    @CurrentUser() user: WebUser,
  ): Promise<EmployeeQualificationView> {
    const siteId = await this.staffing.qualificationSite(body.qualificationId);
    assertScope(user, EVIDENCE_OWNERS, { siteId });
    return this.staffing.recordHolding(body, webUserActor(user));
  }

  @Delete('holdings/:id')
  @HttpCode(204)
  @Roles(...EVIDENCE_OWNERS)
  async removeHolding(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<void> {
    const siteId = await this.staffing.holdingSite(id);
    assertScope(user, EVIDENCE_OWNERS, { siteId });
    await this.staffing.removeHolding(id, webUserActor(user));
  }

  @Put('requirements')
  @HttpCode(200)
  @Roles(...DEMAND_OWNERS)
  async setRequirement(
    @Body(new ZodValidationPipe(SetStaffingRequirementCommand)) body: SetStaffingRequirementCommand,
    @CurrentUser() user: WebUser,
  ): Promise<StaffingRequirementView> {
    const scope = await this.staffing.zoneScope(body.zoneId);
    assertScope(user, DEMAND_OWNERS, scope);
    return this.staffing.setRequirement(body, webUserActor(user));
  }

  @Delete('requirements/:id')
  @HttpCode(204)
  @Roles(...DEMAND_OWNERS)
  async removeRequirement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<void> {
    const scope = await this.staffing.requirementScope(id);
    assertScope(user, DEMAND_OWNERS, scope);
    await this.staffing.removeRequirement(id, webUserActor(user));
  }
}
