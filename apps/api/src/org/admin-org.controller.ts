import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  BindChecklistPositionCommand,
  CreateChecklistCommand,
  CreateOrgUnitCommand,
  CreatePositionCommand,
  CreateSiteCommand,
  CreateTeamCommand,
  CreateZoneCommand,
  DeleteWithReasonCommand,
  RegisterTerminalCommand,
  SetChecklistStatusCommand,
  SetTerminalStatusCommand,
  UpdateChecklistCommand,
  UpdateOrgUnitCommand,
  UpdatePositionCommand,
  UpdateSiteCommand,
  UpdateTeamCommand,
  UpdateTerminalCommand,
  UpdateZoneCommand,
  type ChecklistDefinitionView,
  type OrgSnapshot,
  type TerminalPairingIssued,
  type TerminalRegistered,
  type TerminalView,
} from '@vakhta/contracts';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ChecklistsService } from './checklists.service.js';
import { OrgService } from './org.service.js';

/** Довідники для розділу «Администрирование» (ТЗ 9.1). Читати можуть усі ролі панелі. */
@Controller('admin/org')
@UseGuards(WebAuthGuard)
@Roles('ADMIN')
export class AdminOrgController {
  constructor(
    private readonly org: OrgService,
    private readonly checklists: ChecklistsService,
  ) {}

  @Get()
  @Roles(
    'ADMIN',
    'PRODUCTION_HEAD',
    'HR',
    'PLANNER',
    'SHIFT_MASTER',
    'CLEANLINESS_CONTROLLER',
    'ACCOUNTANT',
    'AUDITOR',
  )
  snapshot(): Promise<OrgSnapshot> {
    return this.org.snapshot();
  }

  @Post('sites')
  @HttpCode(201)
  createSite(
    @Body(new ZodValidationPipe(CreateSiteCommand)) body: CreateSiteCommand,
    @CurrentUser() user: WebUser,
  ) {
    return this.org.createSite(body, webUserActor(user));
  }

  @Post('units')
  @HttpCode(201)
  createOrgUnit(
    @Body(new ZodValidationPipe(CreateOrgUnitCommand)) body: CreateOrgUnitCommand,
    @CurrentUser() user: WebUser,
  ) {
    return this.org.createOrgUnit(body, webUserActor(user));
  }

  @Post('teams')
  @HttpCode(201)
  createTeam(
    @Body(new ZodValidationPipe(CreateTeamCommand)) body: CreateTeamCommand,
    @CurrentUser() user: WebUser,
  ) {
    return this.org.createTeam(body, webUserActor(user));
  }

  @Post('positions')
  @HttpCode(201)
  createPosition(
    @Body(new ZodValidationPipe(CreatePositionCommand)) body: CreatePositionCommand,
    @CurrentUser() user: WebUser,
  ) {
    return this.org.createPosition(body, webUserActor(user));
  }

  @Post('zones')
  @HttpCode(201)
  createZone(
    @Body(new ZodValidationPipe(CreateZoneCommand)) body: CreateZoneCommand,
    @CurrentUser() user: WebUser,
  ) {
    return this.org.createZone(body, webUserActor(user));
  }

  @Patch('sites/:id')
  updateSite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSiteCommand)) body: UpdateSiteCommand,
    @CurrentUser() user: WebUser,
  ) {
    return this.org.updateSite(id, body, webUserActor(user));
  }

  @Patch('units/:id')
  updateOrgUnit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateOrgUnitCommand)) body: UpdateOrgUnitCommand,
    @CurrentUser() user: WebUser,
  ) {
    return this.org.updateOrgUnit(id, body, webUserActor(user));
  }

  @Patch('teams/:id')
  updateTeam(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTeamCommand)) body: UpdateTeamCommand,
    @CurrentUser() user: WebUser,
  ) {
    return this.org.updateTeam(id, body, webUserActor(user));
  }

  @Patch('positions/:id')
  updatePosition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePositionCommand)) body: UpdatePositionCommand,
    @CurrentUser() user: WebUser,
  ) {
    return this.org.updatePosition(id, body, webUserActor(user));
  }

  @Patch('zones/:id')
  updateZone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateZoneCommand)) body: UpdateZoneCommand,
    @CurrentUser() user: WebUser,
  ) {
    return this.org.updateZone(id, body, webUserActor(user));
  }

  @Delete(':kind(sites|units|teams|positions|zones)/:id')
  @HttpCode(204)
  async deleteDirectoryRow(
    @Param('kind') kind: 'sites' | 'units' | 'teams' | 'positions' | 'zones',
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DeleteWithReasonCommand)) body: DeleteWithReasonCommand,
    @CurrentUser() user: WebUser,
  ): Promise<void> {
    const map = {
      sites: 'site',
      units: 'org_unit',
      teams: 'team',
      positions: 'position',
      zones: 'zone',
    } as const;
    await this.org.deleteDirectoryRow(map[kind], id, body.reason, webUserActor(user));
  }

  @Post('terminals')
  @HttpCode(201)
  registerTerminal(
    @Body(new ZodValidationPipe(RegisterTerminalCommand)) body: RegisterTerminalCommand,
    @CurrentUser() user: WebUser,
  ): Promise<TerminalRegistered> {
    return this.org.registerTerminal(body, webUserActor(user));
  }

  @Post('terminals/:id/pairing')
  @HttpCode(201)
  issuePairing(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<TerminalPairingIssued> {
    return this.org.issuePairingCode(id, webUserActor(user));
  }

  @Patch('terminals/:id')
  async updateTerminal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTerminalCommand)) body: UpdateTerminalCommand,
    @CurrentUser() user: WebUser,
  ): Promise<TerminalView> {
    return terminalView(await this.org.updateTerminal(id, body, webUserActor(user)));
  }

  @Delete('terminals/:id')
  @HttpCode(204)
  async deleteTerminal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DeleteWithReasonCommand)) body: DeleteWithReasonCommand,
    @CurrentUser() user: WebUser,
  ): Promise<void> {
    await this.org.deleteTerminal(id, body.reason, webUserActor(user));
  }

  @Patch('terminals/:id/status')
  async setTerminalStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetTerminalStatusCommand)) body: SetTerminalStatusCommand,
    @CurrentUser() user: WebUser,
  ): Promise<TerminalView> {
    return terminalView(await this.org.setTerminalStatus(id, body, webUserActor(user)));
  }

  /* Checklists for the zone handover (spec 5.6): built here, answered in the bot. */

  @Get('checklists')
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'CLEANLINESS_CONTROLLER', 'AUDITOR')
  listChecklists(): Promise<ChecklistDefinitionView[]> {
    return this.checklists.list();
  }

  @Post('checklists')
  @HttpCode(201)
  createChecklist(
    @Body(new ZodValidationPipe(CreateChecklistCommand)) body: CreateChecklistCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ChecklistDefinitionView> {
    return this.checklists.create(body, webUserActor(user));
  }

  @Patch('checklists/:id')
  updateChecklist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateChecklistCommand)) body: UpdateChecklistCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ChecklistDefinitionView> {
    return this.checklists.update(id, body, webUserActor(user));
  }

  @Patch('checklists/:id/status')
  setChecklistStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetChecklistStatusCommand)) body: SetChecklistStatusCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ChecklistDefinitionView> {
    return this.checklists.setStatus(id, body, webUserActor(user));
  }

  @Post('checklists/:id/positions')
  addChecklistPosition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(BindChecklistPositionCommand)) body: BindChecklistPositionCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ChecklistDefinitionView> {
    return this.checklists.addPosition(id, body.positionId, webUserActor(user));
  }

  @Delete('checklists/:id/positions/:positionId')
  removeChecklistPosition(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @CurrentUser() user: WebUser,
  ): Promise<ChecklistDefinitionView> {
    return this.checklists.removePosition(id, positionId, webUserActor(user));
  }

  @Delete('checklists/:id')
  @HttpCode(204)
  async deleteChecklist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DeleteWithReasonCommand)) body: DeleteWithReasonCommand,
    @CurrentUser() user: WebUser,
  ): Promise<void> {
    await this.checklists.delete(id, body.reason, webUserActor(user));
  }
}

function terminalView(row: {
  id: string;
  siteId: string;
  name: string;
  checkpoint: TerminalView['checkpoint'];
  status: TerminalView['status'];
  deviceTokenHash: string | null;
  lastSeenAt: Date | null;
}): TerminalView {
  return {
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    checkpoint: row.checkpoint,
    status: row.status,
    paired: row.deviceTokenHash !== null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  };
}
