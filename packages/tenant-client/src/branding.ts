import type { TenantPublicConfig } from '@vakhta/contracts';

function channels(hex: string): number[] {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}
function luminance(rgb: number[]): number {
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
}
function readableAccent(hex: string, background: number): string {
  const rgb = channels(hex);
  for (let step = 0; step <= 100; step++) {
    const mixed = rgb.map((value) => Math.round(value + ((255 - background - value) * step) / 100));
    const light = luminance(mixed);
    const base = luminance([background, background, background]);
    const minimum = background === 0 ? 7 : 4.5;
    if ((Math.max(light, base) + 0.05) / (Math.min(light, base) + 0.05) >= minimum)
      return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }
  return background === 0 ? '#ffffff' : '#000000';
}

/** Tenant accents affect identity and primary actions, never operational status colours. */
export function brandPalette(accent: string) {
  const light = luminance(channels(accent));
  return {
    accent,
    foreground: light > 0.179 ? '#000000' : '#ffffff',
    onLight: readableAccent(accent, 255),
    onDark: readableAccent(accent, 0),
  };
}

export function applyTenantBranding(config: TenantPublicConfig, document: Document): void {
  const root = document.documentElement;
  if (config.accentColor) {
    const palette = brandPalette(config.accentColor);
    root.dataset.tenantBrand = '';
    root.style.setProperty('--tenant-accent', palette.accent);
    root.style.setProperty('--tenant-foreground', palette.foreground);
    root.style.setProperty('--tenant-on-light', palette.onLight);
    root.style.setProperty('--tenant-on-dark', palette.onDark);
  }
  document.title = config.displayName;
  if (config.logoUrl) {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.type = 'image/webp';
    icon.href = config.logoUrl;
    document.head.querySelectorAll('link[rel="icon"]').forEach((element) => element.remove());
    document.head.append(icon);
  }
}
