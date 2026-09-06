import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ChangeEmployeeStatusCommand,
  CreateEmployeeCommand,
  RelinkTelegramCommand,
  type ActivationCodeIssued,
  type EmployeeView,
  ImportEmployeesCommand,
  type ImportEmployeesResult,
  IssueActivationCodesCommand,
} from '@vakhta/contracts';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ActivationService } from './activation.service.js';
import { EmployeesService } from './employees.service.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';

/** Кадрові картки і привʼязка Telegram для HR і адміністратора (ТЗ 2.2). */
@Controller('admin/employees')
@UseGuards(WebAuthGuard)
@Roles('ADMIN', 'HR')
@UseFilters(IdentityExceptionFilter)
export class AdminEmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly activation: ActivationService,
  ) {}

  @Get()
  @Roles('ADMIN', 'HR', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER')
  list(): Promise<EmployeeView[]> {
    return this.employees.list();
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(CreateEmployeeCommand)) body: CreateEmployeeCommand,
    @CurrentUser() user: WebUser,
  ): Promise<EmployeeView> {
    const row = await this.employees.create(body, webUserActor(user));
    return this.employees.toView(row, false);
  }

  @Post('activation-codes')
  @HttpCode(201)
  issueCodes(
    @Body(new ZodValidationPipe(IssueActivationCodesCommand)) body: IssueActivationCodesCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ActivationCodeIssued[]> {
    return this.activation.issueMany(body.employeeIds, webUserActor(user));
  }

  @Post('import')
  @HttpCode(201)
  importMany(
    @Body(new ZodValidationPipe(ImportEmployeesCommand)) body: ImportEmployeesCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ImportEmployeesResult> {
    return this.employees.importMany(body, webUserActor(user));
  }

  @Get(':id')
  @Roles('ADMIN', 'HR', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeView> {
    const row = await this.employees.getById(id);
    if (!row) throw new NotFoundException();
    const link = await this.employees.activeLinkByEmployee(id);
    return this.employees.toView(row, link !== null);
  }

  @Post(':id/status')
  @HttpCode(200)
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ChangeEmployeeStatusCommand)) body: ChangeEmployeeStatusCommand,
    @CurrentUser() user: WebUser,
  ): Promise<EmployeeView> {
    const row = await this.employees.changeStatus(id, body, webUserActor(user));
    const link = await this.employees.activeLinkByEmployee(id);
    return this.employees.toView(row, link !== null);
  }

  @Post(':id/activation-codes')
  @HttpCode(201)
  issueCode(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<ActivationCodeIssued> {
    return this.activation.issue(id, webUserActor(user));
  }

  @Post(':id/telegram/relink')
  async relink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RelinkTelegramCommand)) body: RelinkTelegramCommand,
    @CurrentUser() user: WebUser,
  ): Promise<{ employeeId: string; telegramUserId: number; linkedAt: string }> {
    const link = await this.employees.relinkTelegram(id, body, webUserActor(user));
    return {
      employeeId: id,
      telegramUserId: link.telegramUserId,
      linkedAt: link.linkedAt.toISOString(),
    };
  }
}
