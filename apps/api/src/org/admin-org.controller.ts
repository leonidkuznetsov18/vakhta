import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  CreateOrgUnitCommand,
  CreatePositionCommand,
  CreateSiteCommand,
  CreateTeamCommand,
  CreateZoneCommand,
  RegisterTerminalCommand,
  type OrgSnapshot,
  type TerminalRegistered,
} from '@vakhta/contracts';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { OrgService } from './org.service.js';

/** Довідники для розділу «Администрирование» (ТЗ 9.1). Читати можуть усі ролі панелі. */
@Controller('admin/org')
@UseGuards(WebAuthGuard)
@Roles('ADMIN')
export class AdminOrgController {
  constructor(private readonly org: OrgService) {}

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

  @Post('terminals')
  @HttpCode(201)
  registerTerminal(
    @Body(new ZodValidationPipe(RegisterTerminalCommand)) body: RegisterTerminalCommand,
    @CurrentUser() user: WebUser,
  ): Promise<TerminalRegistered> {
    return this.org.registerTerminal(body, webUserActor(user));
  }
}
