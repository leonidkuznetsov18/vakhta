import type { TenantSettings } from '@vakhta/contracts';
import { TenantModule, type EmergencyPolicy } from '@vakhta/domain';

/** Per-tenant maintenance parameters (spec 014 FR-001, A-4, FR-040, FR-062). */
export interface MaintenanceOptions {
  /** The tenant module is on; when off, no route, bot entry or machine step is active. */
  readonly enabled: boolean;
  /** Days before the planned date; zeros are already removed. */
  readonly reminderOffsets: readonly number[];
  /** Site-local `HH:MM` at which reminders fire. */
  readonly reminderTime: string;
  readonly emergency: EmergencyPolicy;
}

export const MAINTENANCE_OPTIONS = Symbol('MAINTENANCE_OPTIONS');

const HOUR_DIGITS = 2;

export function maintenanceOptionsFrom(
  settings: TenantSettings,
  modules: readonly TenantModule[],
): MaintenanceOptions {
  const offsets = [
    settings.maintenanceReminderFirstDays,
    settings.maintenanceReminderSecondDays,
    settings.maintenanceReminderLastDays,
  ];
  return {
    enabled: modules.includes(TenantModule.MAINTENANCE),
    reminderOffsets: offsets.filter((days) => days > 0),
    reminderTime: `${String(settings.maintenanceReminderHour).padStart(HOUR_DIGITS, '0')}:00`,
    emergency: {
      ackMinutes: {
        P0: settings.emergencyAckSafetyMinutes,
        P1: settings.emergencyAckStoppedMinutes,
        P2: settings.emergencyAckFaultMinutes,
      },
      escalationGapMinutes: settings.emergencyEscalationGapMinutes,
    },
  };
}
