import { z } from 'zod';

/**
 * Operational parameters of spec section 18 as per-tenant data (specs/011, AC-028). Each tenant
 * stores only its overrides in its own `settings` table (scope `global`, key `tenant.<name>`);
 * everything else falls back to these platform defaults, which equal the pilot values in
 * `docs/parameters.md` and `.env.example`.
 */

const minutes = (min = 1, max = 24 * 60) => z.number().int().min(min).max(max);

export const TenantSettings = z.object({
  arriveBeforeMinutes: minutes(1, 720),
  departAfterMinutes: minutes(1, 720),
  earlyStartWindowMinutes: minutes(0, 240),
  graceMinutes: minutes(0, 120),
  overtimeThresholdMinutes: minutes(0, 240),
  autoCloseGraceMinutes: minutes(1, 720),
  breakMinutes: minutes(1, 120),
  mealMinutes: minutes(1, 180),
  serviceTimeMinutes: minutes(1, 180),
  downtimeEscalationMinutes: minutes(1, 240),
  incidentSlaNormalMinutes: minutes(0, 1440),
  incidentSlaCriticalMinutes: minutes(0, 1440),
  incidentSlaSafetyMinutes: minutes(0, 1440),
  cleaningReminderMinutes: minutes(1, 240),
  handoverReviewWindowMinutes: minutes(1, 1440),
  qrRotationSeconds: z.number().int().min(15).max(300),
  qrTtlSeconds: z.number().int().min(15).max(600),
  mediaMinWidth: z.number().int().min(160).max(4096),
  mediaMinHeight: z.number().int().min(120).max(4096),
  mediaMinBrightness: z.number().int().min(0).max(255),
  mediaNearDuplicateDistance: z.number().int().min(0).max(64),
  mediaRetentionDays: z.number().int().min(30).max(3650),
  shiftReminderMinutes: minutes(1, 720),
  appealWindowDays: z.number().int().min(1).max(30),
});
export type TenantSettings = z.infer<typeof TenantSettings>;
export type TenantSettingKey = keyof TenantSettings;

export const TENANT_SETTING_KEYS = Object.keys(TenantSettings.shape) as TenantSettingKey[];

export const TENANT_SETTING_DEFAULTS: TenantSettings = {
  arriveBeforeMinutes: 180,
  departAfterMinutes: 180,
  earlyStartWindowMinutes: 30,
  graceMinutes: 10,
  overtimeThresholdMinutes: 15,
  autoCloseGraceMinutes: 120,
  breakMinutes: 15,
  mealMinutes: 60,
  serviceTimeMinutes: 30,
  downtimeEscalationMinutes: 15,
  incidentSlaNormalMinutes: 60,
  incidentSlaCriticalMinutes: 30,
  incidentSlaSafetyMinutes: 0,
  cleaningReminderMinutes: 30,
  handoverReviewWindowMinutes: 120,
  qrRotationSeconds: 45,
  qrTtlSeconds: 90,
  mediaMinWidth: 640,
  mediaMinHeight: 480,
  mediaMinBrightness: 40,
  mediaNearDuplicateDistance: 6,
  mediaRetentionDays: 365,
  shiftReminderMinutes: 30,
  appealWindowDays: 3,
};

/** Sections of the control panel's Parameters tab, in display order. */
export const TENANT_SETTING_GROUPS = {
  presence: [
    'arriveBeforeMinutes',
    'departAfterMinutes',
    'earlyStartWindowMinutes',
    'graceMinutes',
  ],
  shift: ['overtimeThresholdMinutes', 'autoCloseGraceMinutes', 'shiftReminderMinutes'],
  breaks: ['breakMinutes', 'mealMinutes', 'serviceTimeMinutes'],
  incidents: [
    'downtimeEscalationMinutes',
    'incidentSlaNormalMinutes',
    'incidentSlaCriticalMinutes',
    'incidentSlaSafetyMinutes',
  ],
  handover: ['cleaningReminderMinutes', 'handoverReviewWindowMinutes', 'appealWindowDays'],
  kiosk: ['qrRotationSeconds', 'qrTtlSeconds'],
  photos: [
    'mediaMinWidth',
    'mediaMinHeight',
    'mediaMinBrightness',
    'mediaNearDuplicateDistance',
    'mediaRetentionDays',
  ],
} as const satisfies Record<string, readonly TenantSettingKey[]>;
export type TenantSettingGroup = keyof typeof TENANT_SETTING_GROUPS;

/** Row key in the tenant `settings` table. */
export const TENANT_SETTING_PREFIX = 'tenant.';
export const TENANT_SETTING_SCOPE = 'global';

export function tenantSettingRowKey(key: TenantSettingKey): string {
  return `${TENANT_SETTING_PREFIX}${key}`;
}

const KEYS = new Set<string>(TENANT_SETTING_KEYS);

function isSettingKey(name: string): name is TenantSettingKey {
  return KEYS.has(name);
}

export interface SettingRow {
  readonly key: string;
  readonly value: unknown;
}

export interface ResolvedTenantSettings {
  readonly settings: TenantSettings;
  readonly overrides: Partial<TenantSettings>;
  /** Stored keys whose value failed validation; the default applies and the key is reported. */
  readonly invalid: readonly TenantSettingKey[];
}

/** Defaults overlaid by valid stored overrides; invalid or unknown rows never reach runtime. */
export function resolveTenantSettings(
  defaults: TenantSettings,
  rows: readonly SettingRow[],
): ResolvedTenantSettings {
  const settings: TenantSettings = { ...defaults };
  const overrides: Partial<TenantSettings> = {};
  const invalid: TenantSettingKey[] = [];
  for (const row of rows) {
    if (!row.key.startsWith(TENANT_SETTING_PREFIX)) continue;
    const name = row.key.slice(TENANT_SETTING_PREFIX.length);
    if (!isSettingKey(name)) continue;
    const parsed = TenantSettings.shape[name].safeParse(row.value);
    if (!parsed.success) {
      invalid.push(name);
      continue;
    }
    settings[name] = parsed.data;
    overrides[name] = parsed.data;
  }
  return withConsistentPairs(defaults, { settings, overrides, invalid });
}

interface CrossFieldRule {
  /** The key the problem is reported on. */
  readonly report: TenantSettingKey;
  /** Keys that fall back together when stored values break the rule. */
  readonly keys: readonly TenantSettingKey[];
  readonly holds: (settings: TenantSettings) => boolean;
}

const CROSS_FIELD_RULES: readonly CrossFieldRule[] = [
  // A QR must stay valid at least until the kiosk replaces it.
  {
    report: 'qrTtlSeconds',
    keys: ['qrRotationSeconds', 'qrTtlSeconds'],
    holds: (settings) => settings.qrTtlSeconds >= settings.qrRotationSeconds,
  },
];

/** Stored values that break a cross-field rule (e.g. two concurrent writes) fall back together. */
function withConsistentPairs(
  defaults: TenantSettings,
  resolved: ResolvedTenantSettings,
): ResolvedTenantSettings {
  const broken = CROSS_FIELD_RULES.filter((rule) => !rule.holds(resolved.settings));
  const reset = new Set(broken.flatMap((rule) => rule.keys));
  if (reset.size === 0) return resolved;
  const settings = { ...resolved.settings };
  const overrides = { ...resolved.overrides };
  const invalid = new Set(resolved.invalid);
  for (const key of reset) {
    settings[key] = defaults[key];
    delete overrides[key];
    invalid.add(key);
  }
  return { settings, overrides, invalid: [...invalid] };
}

/** Cross-field rules checked on the effective values before a write is accepted. */
export function tenantSettingsProblems(settings: TenantSettings): TenantSettingKey[] {
  return CROSS_FIELD_RULES.filter((rule) => !rule.holds(settings)).map((rule) => rule.report);
}

/** `null` removes the override and returns the key to its default. */
export const UpdateTenantSettingsCommand = z.object({
  values: z.record(z.string(), z.number().int().nullable()),
});
export type UpdateTenantSettingsCommand = z.infer<typeof UpdateTenantSettingsCommand>;

export const TenantSettingsView = z.object({
  defaults: TenantSettings,
  overrides: TenantSettings.partial(),
  effective: TenantSettings,
  invalid: z.array(z.string()),
});
export type TenantSettingsView = z.infer<typeof TenantSettingsView>;
