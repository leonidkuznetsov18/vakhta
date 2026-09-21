import { TENANT_SETTING_DEFAULTS, type TenantSettings } from '@vakhta/contracts';
import type { Env } from './env.js';

type SettingsEnv = Pick<
  Env,
  | 'PRESENCE_ARRIVE_BEFORE_MINUTES'
  | 'PRESENCE_DEPART_AFTER_MINUTES'
  | 'EARLY_START_WINDOW_MINUTES'
  | 'SHIFT_GRACE_MINUTES'
  | 'OVERTIME_THRESHOLD_MINUTES'
  | 'AUTO_CLOSE_GRACE_MINUTES'
  | 'BREAK_MINUTES'
  | 'MEAL_MINUTES'
  | 'SERVICE_TIME_MINUTES'
  | 'DOWNTIME_ESCALATION_MINUTES'
  | 'INCIDENT_SLA_NORMAL_MINUTES'
  | 'INCIDENT_SLA_CRITICAL_MINUTES'
  | 'INCIDENT_SLA_SAFETY_MINUTES'
  | 'CLEANING_REMINDER_MINUTES'
  | 'HANDOVER_REVIEW_WINDOW_MINUTES'
  | 'QR_ROTATION_SECONDS'
  | 'QR_TTL_SECONDS'
  | 'SHIFT_REMINDER_MINUTES'
  | 'ACK_REMINDER_HOURS'
  | 'APPEAL_WINDOW_DAYS'
>;

/**
 * Defaults of the environment-defined tenant (`TENANCY_MODE=env`): the deployment's variables, so
 * the pilot behaves exactly as before. Registry tenants use the platform catalog instead; at
 * cutover, values that differ from the catalog are stored as the pilot's overrides.
 */
export function settingsFromEnv(env: SettingsEnv): TenantSettings {
  return {
    ...TENANT_SETTING_DEFAULTS,
    arriveBeforeMinutes: env.PRESENCE_ARRIVE_BEFORE_MINUTES,
    departAfterMinutes: env.PRESENCE_DEPART_AFTER_MINUTES,
    earlyStartWindowMinutes: env.EARLY_START_WINDOW_MINUTES,
    graceMinutes: env.SHIFT_GRACE_MINUTES,
    overtimeThresholdMinutes: env.OVERTIME_THRESHOLD_MINUTES,
    autoCloseGraceMinutes: env.AUTO_CLOSE_GRACE_MINUTES,
    breakMinutes: env.BREAK_MINUTES,
    mealMinutes: env.MEAL_MINUTES,
    serviceTimeMinutes: env.SERVICE_TIME_MINUTES,
    downtimeEscalationMinutes: env.DOWNTIME_ESCALATION_MINUTES,
    incidentSlaNormalMinutes: env.INCIDENT_SLA_NORMAL_MINUTES,
    incidentSlaCriticalMinutes: env.INCIDENT_SLA_CRITICAL_MINUTES,
    incidentSlaSafetyMinutes: env.INCIDENT_SLA_SAFETY_MINUTES,
    cleaningReminderMinutes: env.CLEANING_REMINDER_MINUTES,
    handoverReviewWindowMinutes: env.HANDOVER_REVIEW_WINDOW_MINUTES,
    qrRotationSeconds: env.QR_ROTATION_SECONDS,
    qrTtlSeconds: env.QR_TTL_SECONDS,
    shiftReminderMinutes: env.SHIFT_REMINDER_MINUTES,
    ackReminderHours: env.ACK_REMINDER_HOURS,
    appealWindowDays: env.APPEAL_WINDOW_DAYS,
  };
}
