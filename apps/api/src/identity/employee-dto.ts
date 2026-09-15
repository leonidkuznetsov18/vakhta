import { createZodDto } from 'nestjs-zod';
import {
  EmployeesPage,
  ImportEmployeesCommand,
  ImportEmployeesResult,
  ListEmployeesPageQuery,
} from '@vakhta/contracts';

export class EmployeePageQueryDto extends createZodDto(ListEmployeesPageQuery) {}
export class EmployeePageDto extends createZodDto(EmployeesPage) {}
export class EmployeeImportDto extends createZodDto(ImportEmployeesCommand) {}
export class EmployeeImportResultDto extends createZodDto(ImportEmployeesResult) {}
