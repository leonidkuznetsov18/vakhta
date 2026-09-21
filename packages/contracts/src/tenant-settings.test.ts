import { describe, expect, it } from 'vitest';
import {
  TENANT_SETTING_DEFAULTS,
  TENANT_SETTING_GROUPS,
  TENANT_SETTING_KEYS,
  TenantSettings,
  resolveTenantSettings,
  tenantSettingRowKey,
  tenantSettingsProblems,
} from './tenant-settings.js';

describe('tenant settings catalog', () => {
  it('defaults satisfy the schema and every key belongs to exactly one group', () => {
    expect(TenantSettings.parse(TENANT_SETTING_DEFAULTS)).toEqual(TENANT_SETTING_DEFAULTS);
    const grouped = Object.values(TENANT_SETTING_GROUPS).flat();
    expect([...grouped].sort()).toEqual([...TENANT_SETTING_KEYS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('applies valid overrides and keeps defaults elsewhere', () => {
    const r = resolveTenantSettings(TENANT_SETTING_DEFAULTS, [
      { key: tenantSettingRowKey('qrRotationSeconds'), value: 30 },
      { key: tenantSettingRowKey('mealMinutes'), value: 45 },
    ]);
    expect(r.settings.qrRotationSeconds).toBe(30);
    expect(r.settings.mealMinutes).toBe(45);
    expect(r.settings.breakMinutes).toBe(TENANT_SETTING_DEFAULTS.breakMinutes);
    expect(r.overrides).toEqual({ qrRotationSeconds: 30, mealMinutes: 45 });
    expect(r.invalid).toEqual([]);
  });

  it('falls back to the default for an invalid stored value and reports it; ignores foreign keys', () => {
    const r = resolveTenantSettings(TENANT_SETTING_DEFAULTS, [
      { key: tenantSettingRowKey('mediaMinBrightness'), value: 999 },
      { key: tenantSettingRowKey('breakMinutes'), value: '15' },
      { key: 'tenant.unknownKey', value: 5 },
      { key: 'support.model', value: 'x' },
    ]);
    expect(r.settings).toEqual(TENANT_SETTING_DEFAULTS);
    expect(r.invalid).toEqual(['mediaMinBrightness', 'breakMinutes']);
    expect(r.overrides).toEqual({});
  });

  it('rejects a QR lifetime shorter than its rotation', () => {
    expect(tenantSettingsProblems(TENANT_SETTING_DEFAULTS)).toEqual([]);
    expect(
      tenantSettingsProblems({
        ...TENANT_SETTING_DEFAULTS,
        qrRotationSeconds: 60,
        qrTtlSeconds: 45,
      }),
    ).toEqual(['qrTtlSeconds']);
  });

  it('drops a stored QR pair that breaks the lifetime rule back to both defaults', () => {
    const r = resolveTenantSettings(TENANT_SETTING_DEFAULTS, [
      { key: tenantSettingRowKey('qrRotationSeconds'), value: 60 },
      { key: tenantSettingRowKey('qrTtlSeconds'), value: 50 },
      { key: tenantSettingRowKey('mealMinutes'), value: 45 },
    ]);
    expect(r.settings.qrRotationSeconds).toBe(TENANT_SETTING_DEFAULTS.qrRotationSeconds);
    expect(r.settings.qrTtlSeconds).toBe(TENANT_SETTING_DEFAULTS.qrTtlSeconds);
    expect(r.overrides).toEqual({ mealMinutes: 45 });
    expect(r.invalid).toEqual(['qrRotationSeconds', 'qrTtlSeconds']);
  });
});
