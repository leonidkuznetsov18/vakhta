import { WebRole } from '../access/roles.js';

/** Who sees the maintenance section: the register, calendar and work (spec 014, D-2). */
export const MAINTENANCE_VIEWERS: readonly WebRole[] = [
  WebRole.ADMIN,
  WebRole.CHIEF_MECHANIC,
  WebRole.PRODUCTION_HEAD,
  WebRole.SHIFT_MASTER,
  WebRole.PLANNER,
  WebRole.AUDITOR,
];

/** Who manages equipment, manuals and plans, reviews maintenance and re-plans work. */
export const MAINTENANCE_MANAGERS: readonly WebRole[] = [WebRole.ADMIN, WebRole.CHIEF_MECHANIC];

/** Who creates an emergency repair from the panel and releases a machine after it (AC-046, AC-049). */
export const MAINTENANCE_RESPONDERS: readonly WebRole[] = [
  WebRole.ADMIN,
  WebRole.CHIEF_MECHANIC,
  WebRole.SHIFT_MASTER,
];
