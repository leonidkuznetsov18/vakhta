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
import { ProvisioningStep } from '@vakhta/domain';
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
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TenantDetailView> {
    return this.tenants.get(id);
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
    const detail = await this.tenants.get(id);
    const [job] = await this.provisioning.listForTenant(id);
    const adminEmail = job?.steps.find((s) => s.step === ProvisioningStep.INVITE_ADMIN)?.output?.[
      'adminEmail'
    ];
    const email = typeof adminEmail === 'string' ? adminEmail : null;
    if (!email) return { url: detail.onboarding?.url ?? '' };
    const issued = await this.tenants.issueInvitation({
      tenantId: id,
      adminEmail: email,
      actor: operator,
    });
    return { url: issued.url };
  }

  @Get(':id/jobs')
  jobs(@Param('id', ParseUUIDPipe) id: string): Promise<ProvisioningJobView[]> {
    return this.provisioning.listForTenant(id);
  }

  @Get(':id/audit')
  auditLog(@Param('id', ParseUUIDPipe) id: string): Promise<ControlAuditEntryView[]> {
    return this.audit.list(id);
  }
}
