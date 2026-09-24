/** The tabs of the maintenance section; the address holds the tab and the open record. */
export const MaintenanceTab = {
  EQUIPMENT: 'equipment',
  CALENDAR: 'calendar',
  WORK: 'work',
} as const;
export type MaintenanceTab = (typeof MaintenanceTab)[keyof typeof MaintenanceTab];

export const MAINTENANCE_TABS: readonly MaintenanceTab[] = [
  MaintenanceTab.EQUIPMENT,
  MaintenanceTab.CALENDAR,
  MaintenanceTab.WORK,
];

export function parseTab(value: string | undefined): MaintenanceTab {
  return MAINTENANCE_TABS.find((tab) => tab === value) ?? MaintenanceTab.EQUIPMENT;
}

export function hasRole(roles: readonly string[], allowed: readonly string[]): boolean {
  const permitted = new Set(allowed);
  return roles.some((role) => permitted.has(role));
}
