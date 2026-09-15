import {
  EmployeesPage,
  ImportEmployeesCommand,
  ImportEmployeesResult,
  ListEmployeesPageQuery,
} from '@vakhta/contracts';
import { listEmployeePage, importEmployeeBatch } from './generated/employees';

export async function readEmployeePage(query: ListEmployeesPageQuery, signal?: AbortSignal) {
  return EmployeesPage.parse(
    await listEmployeePage(ListEmployeesPageQuery.parse(query), signal ? { signal } : undefined),
  );
}

export async function importEmployees(
  input: ImportEmployeesCommand,
): Promise<ImportEmployeesResult> {
  return ImportEmployeesResult.parse(
    await importEmployeeBatch(ImportEmployeesCommand.parse(input)),
  );
}
