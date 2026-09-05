/** Хто виконує дію. Пишеться в domain_events і audit_log (ТЗ 11.1, FR-COR-04). */
export type ActorType = 'EMPLOYEE' | 'WEB_USER' | 'SYSTEM' | 'TERMINAL';

export interface Actor {
  readonly type: ActorType;
  /** employee_id, web_user_id або null для системи чи тимчасового адмін-токена. */
  readonly id: string | null;
  readonly role: string | null;
  /** Людське пояснення джерела, коли id немає: наприклад 'admin-api-token'. */
  readonly label?: string;
}

export const SYSTEM_ACTOR: Actor = Object.freeze({ type: 'SYSTEM', id: null, role: 'SYSTEM' });

export function employeeActor(employeeId: string): Actor {
  return { type: 'EMPLOYEE', id: employeeId, role: 'EMPLOYEE' };
}
