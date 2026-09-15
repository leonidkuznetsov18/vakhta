import { ImportEmployeesCommand, ImportEmployeesResult } from '@vakhta/contracts';
import { apiFetch } from '@/api';

export async function importEmployees(
  input: ImportEmployeesCommand,
): Promise<ImportEmployeesResult> {
  return ImportEmployeesResult.parse(
    await apiFetch<unknown>('/admin/employees/import', {
      method: 'POST',
      body: JSON.stringify(ImportEmployeesCommand.parse(input)),
    }),
  );
}
