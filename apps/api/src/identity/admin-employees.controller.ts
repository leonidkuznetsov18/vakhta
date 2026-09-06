import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ChangeEmployeeStatusCommand,
  CreateEmployeeCommand,
  DeleteEmployeeCommand,
  RelinkTelegramCommand,
  type ActivationCodeIssued,
  type EmployeeView,
  ImportEmployeesCommand,
  type ImportEmployeesResult,
  IssueActivationCodesCommand,
  UpdateEmployeeCommand,
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
import { PositionsService } from './positions.service.js';
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
    private readonly positions: PositionsService,
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
    const actor = webUserActor(user);
    const row = await this.employees.create(body, actor);
    if (body.orgUnitId && body.positionId) {
      await this.positions.assign(
        row.id,
        {
          orgUnitId: body.orgUnitId,
          positionId: body.positionId,
          ...(body.teamId ? { teamId: body.teamId } : {}),
        },
        actor,
      );
    }
    return this.employees.viewOf(row.id);
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

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateEmployeeCommand)) body: UpdateEmployeeCommand,
    @CurrentUser() user: WebUser,
  ): Promise<EmployeeView> {
    await this.employees.update(id, body, webUserActor(user));
    return this.employees.viewOf(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DeleteEmployeeCommand)) body: DeleteEmployeeCommand,
    @CurrentUser() user: WebUser,
  ): Promise<void> {
    await this.employees.deleteEmployee(id, body, webUserActor(user));
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
