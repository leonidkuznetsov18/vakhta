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
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ListEmployeesPageQuery,
  type EmployeesPage,
  ChangeEmployeeStatusCommand,
  CreateEmployeeCommand,
  SendEmployeeMessageCommand,
  BulkDeleteEmployeesCommand,
  type BulkDeleteEmployeesResult,
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
import { type WebRole } from '@vakhta/domain';
import { DomainError } from '../common/domain-error.js';
import { assertInScope, scopeOf } from '../common/access-scope.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ActivationService } from './activation.service.js';
import { EmployeesService } from './employees.service.js';
import { PositionsService } from './positions.service.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';

/** Roles that read the directory; writes stay with ADMIN and HR. */
export const EMPLOYEE_READERS: readonly WebRole[] = [
  'ADMIN',
  'HR',
  'ACCOUNTANT',
  'PRODUCTION_HEAD',
  'PLANNER',
  'SHIFT_MASTER',
];
export const EMPLOYEE_WRITERS: readonly WebRole[] = ['ADMIN', 'HR'];
const EMPLOYEE_MESSENGERS: readonly WebRole[] = ['ADMIN', 'HR', 'PRODUCTION_HEAD', 'SHIFT_MASTER'];

/**
 * Кадрові картки і привʼязка Telegram для HR і адміністратора (ТЗ 2.2). Every read and action is
 * limited to the grant that allows it: a unit master sees and messages only their unit's people.
 */
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
  @Roles('ADMIN', 'HR', 'ACCOUNTANT', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER')
  async list(@CurrentUser() user: WebUser): Promise<EmployeeView[]> {
    return Promise.all(
      (await this.employees.list(200, scopeOf(user, EMPLOYEE_READERS))).map((row) =>
        this.employees.restrictView(row, user),
      ),
    );
  }

  @Get('page')
  @Roles('ADMIN', 'HR', 'ACCOUNTANT', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER')
  async listPage(
    @Query(new ZodValidationPipe(ListEmployeesPageQuery)) query: ListEmployeesPageQuery,
    @CurrentUser() user: WebUser,
  ): Promise<EmployeesPage> {
    const page = await this.employees.listPage(query, scopeOf(user, EMPLOYEE_READERS));
    return {
      ...page,
      items: await Promise.all(page.items.map((row) => this.employees.restrictView(row, user))),
    };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(CreateEmployeeCommand)) body: CreateEmployeeCommand,
    @CurrentUser() user: WebUser,
  ): Promise<EmployeeView> {
    const scope = scopeOf(user, EMPLOYEE_WRITERS);
    if (!scope.all) {
      // A card without a unit would be invisible to its scoped author; it must land in their scope.
      if (!body.orgUnitId) throw outOfScope('A scoped writer must assign the employee to a unit');
      await this.employees.assertPlaceInScope(scope, body.orgUnitId, body.teamId ?? null);
    }
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
  async issueCodes(
    @Body(new ZodValidationPipe(IssueActivationCodesCommand)) body: IssueActivationCodesCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ActivationCodeIssued[]> {
    await this.assertEmployees(user, EMPLOYEE_WRITERS, body.employeeIds);
    return this.activation.issueMany(body.employeeIds, webUserActor(user));
  }

  @Post('import')
  @HttpCode(201)
  async importMany(
    @Body(new ZodValidationPipe(ImportEmployeesCommand)) body: ImportEmployeesCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ImportEmployeesResult> {
    // Imported cards have no assignment, so only an enterprise-wide writer could see them again.
    if (!scopeOf(user, EMPLOYEE_WRITERS).all) {
      throw outOfScope('Import creates unassigned employees and needs an enterprise scope');
    }
    return this.employees.importMany(body, webUserActor(user));
  }

  @Get(':id')
  @Roles('ADMIN', 'HR', 'ACCOUNTANT', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<EmployeeView> {
    await this.assertEmployees(user, EMPLOYEE_READERS, [id]);
    return this.employees.restrictView(await this.employees.viewOf(id), user);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateEmployeeCommand)) body: UpdateEmployeeCommand,
    @CurrentUser() user: WebUser,
  ): Promise<EmployeeView> {
    await this.assertEmployees(user, EMPLOYEE_WRITERS, [id]);
    await this.employees.update(id, body, webUserActor(user), user);
    return this.employees.viewOf(id);
  }

  @Post('bulk-delete')
  @HttpCode(200)
  async bulkDelete(
    @Body(new ZodValidationPipe(BulkDeleteEmployeesCommand)) body: BulkDeleteEmployeesCommand,
    @CurrentUser() user: WebUser,
  ): Promise<BulkDeleteEmployeesResult> {
    await this.assertEmployees(user, EMPLOYEE_WRITERS, body.ids);
    return this.employees.bulkDelete(body, webUserActor(user));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DeleteEmployeeCommand)) body: DeleteEmployeeCommand,
    @CurrentUser() user: WebUser,
  ): Promise<void> {
    await this.assertEmployees(user, EMPLOYEE_WRITERS, [id]);
    await this.employees.deleteEmployee(id, body, webUserActor(user));
  }

  /** Words to one employee's bot; nothing about the employee changes. */
  @Post(':id/message')
  @HttpCode(200)
  @Roles('ADMIN', 'HR', 'PRODUCTION_HEAD', 'SHIFT_MASTER')
  async message(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SendEmployeeMessageCommand)) body: SendEmployeeMessageCommand,
    @CurrentUser() user: WebUser,
  ): Promise<{ employeeId: string; fullName: string }> {
    await this.assertEmployees(user, EMPLOYEE_MESSENGERS, [id]);
    return this.employees.message(id, body.text, webUserActor(user));
  }

  @Post(':id/status')
  @HttpCode(200)
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ChangeEmployeeStatusCommand)) body: ChangeEmployeeStatusCommand,
    @CurrentUser() user: WebUser,
  ): Promise<EmployeeView> {
    await this.assertEmployees(user, EMPLOYEE_WRITERS, [id]);
    const row = await this.employees.changeStatus(id, body, webUserActor(user));
    const link = await this.employees.activeLinkByEmployee(id);
    return this.employees.toView(row, link !== null);
  }

  @Post(':id/activation-codes')
  @HttpCode(201)
  async issueCode(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<ActivationCodeIssued> {
    await this.assertEmployees(user, EMPLOYEE_WRITERS, [id]);
    return this.activation.issue(id, webUserActor(user));
  }

  @Post(':id/telegram/relink')
  async relink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RelinkTelegramCommand)) body: RelinkTelegramCommand,
    @CurrentUser() user: WebUser,
  ): Promise<{ employeeId: string; telegramUserId: number; linkedAt: string }> {
    await this.assertEmployees(user, EMPLOYEE_WRITERS, [id]);
    const link = await this.employees.relinkTelegram(id, body, webUserActor(user));
    return {
      employeeId: id,
      telegramUserId: link.telegramUserId,
      linkedAt: link.linkedAt.toISOString(),
    };
  }

  /**
   * Employees named by identifier must be inside the grant of the endpoint's roles. A missing or
   * unassigned employee is forbidden for a scoped user too, so identifiers cannot be probed.
   */
  private async assertEmployees(
    user: WebUser,
    roles: readonly WebRole[],
    ids: readonly string[],
  ): Promise<void> {
    const scope = scopeOf(user, roles);
    if (scope.all) return;
    for (const id of new Set(ids)) assertInScope(scope, await this.employees.placeOf(id));
  }
}

function outOfScope(message: string): DomainError {
  return new DomainError('OUT_OF_SCOPE', 403, message);
}
