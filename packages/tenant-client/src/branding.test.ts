import { describe, expect, it } from 'vitest';
import { brandPalette } from './branding.js';
function brightness(color: string): number {
  const values = [1, 3, 5].map((offset) => {
    const s = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return (values[0] ?? 0) * 0.2126 + (values[1] ?? 0) * 0.7152 + (values[2] ?? 0) * 0.0722;
}
function contrast(a: string, b: string): number {
  const x = brightness(a);
  const y = brightness(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
describe('brand colour accessibility', () => {
  it.each(['#000000', '#ffffff', '#777777', '#ffff00', '#2563eb', '#ff0000', '#00ff00'])(
    'keeps %s legible in primary actions and both themes',
    (accent) => {
      const palette = brandPalette(accent);
      expect(palette.accent).toBe(accent);
      expect(contrast(palette.foreground, accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.onLight, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.onDark, '#10161c')).toBeGreaterThanOrEqual(4.5);
    },
  );
});
