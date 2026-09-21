import { EmployeeStatusSchema, type EmployeeView } from '@vakhta/contracts';

export function isTerminated(employee: Pick<EmployeeView, 'status'> | undefined): boolean {
  return employee?.status === EmployeeStatusSchema.enum.TERMINATED;
}
