import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  AddDomainCommand,
  CreateTenantCommand,
  DeleteTenantCommand,
  MODULE_CATALOG,
  SetBotTokenCommand,
  SetModuleCommand,
  SuspendTenantCommand,
  TenantModuleSchema,
  UpdateTenantCommand,
  type ControlAuditEntryView,
  type ProvisioningJobView,
  type TenantDetailView,
  type TenantSummaryView,
} from '@vakhta/contracts';
import { z } from 'zod';
import { tenantForOperator, jobForOperator } from '../auth/operator-views.js';
import { ControlAudit } from '../audit/audit.service.js';
import {
  CurrentOperator,
  OperatorGuard,
  OperatorRole,
  OperatorRoles,
  type Operator,
} from '../auth/operator.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';
import { TenantDeletionService } from './deletion.service.js';
import { TenantsService } from './tenants.service.js';

const ADMIN = OperatorRole.PLATFORM_ADMIN;
const ModuleParams = z.object({ id: z.uuid(), module: TenantModuleSchema });
type ModuleParams = z.infer<typeof ModuleParams>;

/** Everything the control panel edits about a tenant lives here; reads are open to viewers. */
@Controller('control/tenants')
@UseGuards(OperatorGuard)
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly deletion: TenantDeletionService,
    private readonly provisioning: ProvisioningService,
    private readonly audit: ControlAudit,
  ) {}

  @Get()
  list(): Promise<TenantSummaryView[]> {
    return this.tenants.list();
  }

  @Get('modules/catalog')
  catalog() {
    return MODULE_CATALOG;
  }

  @Post()
  @OperatorRoles(ADMIN)
  create(
    @Body(new ZodValidationPipe(CreateTenantCommand)) body: CreateTenantCommand,
    @CurrentOperator() operator: Operator,
  ): Promise<TenantDetailView> {
    return this.tenants.create(body, operator);
  }

  @Get(':id')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOperator() operator: Operator,
  ): Promise<TenantDetailView> {
    return tenantForOperator(await this.tenants.get(id), operator);
  }

  @Patch(':id')
  @OperatorRoles(ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTenantCommand)) body: UpdateTenantCommand,
    @CurrentOperator() operator: Operator,
  ): Promise<TenantDetailView> {
    return this.tenants.update(id, body, operator);
  }

  @Put(':id/modules/:module')
  @OperatorRoles(ADMIN)
  setModule(
    @Param(new ZodValidationPipe(ModuleParams)) params: ModuleParams,
    @Body(new ZodValidationPipe(SetModuleCommand)) body: SetModuleCommand,
    @CurrentOperator() operator: Operator,
  ): Promise<TenantDetailView> {
    return this.tenants.setModule(params.id, { ...body, module: params.module }, operator);
  }

  @Post(':id/domains')
  @OperatorRoles(ADMIN)
  addDomain(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddDomainCommand)) body: AddDomainCommand,
    @CurrentOperator() operator: Operator,
  ): Promise<TenantDetailView> {
    return this.tenants.addDomain(id, body, operator);
  }

  @Put(':id/bot-token')
  @OperatorRoles(ADMIN)
  setBotToken(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetBotTokenCommand)) body: SetBotTokenCommand,
    @CurrentOperator() operator: Operator,
  ): Promise<TenantDetailView> {
    return this.tenants.setBotToken(id, body, operator);
  }

  @Post(':id/provision')
  @OperatorRoles(ADMIN)
  provision(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOperator() operator: Operator,
  ): Promise<TenantDetailView> {
    return this.tenants.startProvisioning(id, operator);
  }

  @Post(':id/delete')
  @OperatorRoles(ADMIN)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DeleteTenantCommand)) body: DeleteTenantCommand,
    @CurrentOperator() operator: Operator,
  ): Promise<ProvisioningJobView> {
    return this.deletion.remove(id, body.reason, operator);
  }

  @Post(':id/suspend')
  @OperatorRoles(ADMIN)
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SuspendTenantCommand)) body: SuspendTenantCommand,
    @CurrentOperator() operator: Operator,
  ): Promise<TenantDetailView> {
    return this.tenants.suspend(id, body.reason, operator);
  }

  @Post(':id/resume')
  @OperatorRoles(ADMIN)
  resume(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOperator() operator: Operator,
  ): Promise<TenantDetailView> {
    return this.tenants.resume(id, operator);
  }

  @Post(':id/invitations')
  @OperatorRoles(ADMIN)
  async reissueInvitation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOperator() operator: Operator,
  ): Promise<{ url: string }> {
    return this.tenants.reissueInvitation(id, operator);
  }

  @Get(':id/jobs')
  async jobs(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOperator() operator: Operator,
  ): Promise<ProvisioningJobView[]> {
    return (await this.provisioning.listForTenant(id)).map((job) => jobForOperator(job, operator));
  }

  @Get(':id/audit')
  auditLog(@Param('id', ParseUUIDPipe) id: string): Promise<ControlAuditEntryView[]> {
    return this.audit.list(id);
  }
}
