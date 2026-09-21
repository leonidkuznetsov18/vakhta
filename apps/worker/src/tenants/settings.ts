import {
  TENANT_SETTING_DEFAULTS,
  resolveTenantSettings,
  type TenantSettings,
} from '@vakhta/contracts';
import { readTenantSettingRows, type Database } from '@vakhta/db';
import { ENV_TENANT_ID, type TenantRuntimeConfig } from '@vakhta/registry';
import type { WorkerEnv } from '../env.js';

/** The env tenant keeps the deployment's variables; registry tenants use the platform catalog. */
export function workerSettingsDefaults(
  tenant: TenantRuntimeConfig,
  env: WorkerEnv,
): TenantSettings {
  if (tenant.id !== ENV_TENANT_ID) return TENANT_SETTING_DEFAULTS;
  return {
    ...TENANT_SETTING_DEFAULTS,
    shiftReminderMinutes: env.SHIFT_REMINDER_MINUTES,
    ackReminderHours: env.ACK_REMINDER_HOURS,
    breakMinutes: env.BREAK_MINUTES,
    mealMinutes: env.MEAL_MINUTES,
    serviceTimeMinutes: env.SERVICE_TIME_MINUTES,
    downtimeEscalationMinutes: env.DOWNTIME_ESCALATION_MINUTES,
    cleaningReminderMinutes: env.CLEANING_REMINDER_MINUTES,
    autoCloseGraceMinutes: env.AUTO_CLOSE_GRACE_MINUTES,
    mediaMinWidth: env.MEDIA_MIN_WIDTH,
    mediaMinHeight: env.MEDIA_MIN_HEIGHT,
    mediaMinBrightness: env.MEDIA_MIN_BRIGHTNESS,
    mediaNearDuplicateDistance: env.MEDIA_NEAR_DUPLICATE_DISTANCE,
    mediaRetentionDays: env.MEDIA_RETENTION_DAYS,
  };
}

/**
 * Effective settings of one tenant. A failed read rejects: a worker never runs a tenant on
 * platform defaults that silently replace its stored overrides.
 */
export async function loadWorkerSettings(
  db: Database,
  defaults: TenantSettings,
): Promise<TenantSettings> {
  return resolveTenantSettings(defaults, await readTenantSettingRows(db)).settings;
}

export function settingsFingerprint(settings: TenantSettings): string {
  return JSON.stringify(settings);
}
