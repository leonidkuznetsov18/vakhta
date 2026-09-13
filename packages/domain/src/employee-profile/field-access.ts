import type { WebRole } from '../access/roles.js';

/** Supply only roles whose grants cover the employee, never the user's unscoped role list. */
export function profileFieldAccess(roles: readonly WebRole[]) {
  const personalEdit = roles.some((role) => role === 'ADMIN' || role === 'HR');
  return {
    personalEdit,
    maritalStatus: personalEdit,
    birthDate:
      personalEdit || roles.includes('ACCOUNTANT') ? ('FULL' as const) : ('DAY_MONTH' as const),
    compensation: personalEdit
      ? ('WRITE' as const)
      : roles.includes('ACCOUNTANT')
        ? ('READ' as const)
        : ('NONE' as const),
  };
}
