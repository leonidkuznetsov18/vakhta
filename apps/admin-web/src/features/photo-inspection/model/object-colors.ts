export type HexColor = `#${string}`;
/** Vivid, clearly different hues in an order where neighbours never look alike. */
export const OBJECT_PALETTE: readonly HexColor[] = [
  '#ff2d55', // red
  '#0a84ff', // blue
  '#ffd60a', // yellow
  '#30d158', // green
  '#bf5af2', // purple
  '#ff9f0a', // orange
  '#64d2ff', // cyan
  '#ff375f', // pink
  '#a3e635', // lime
  '#ffffff', // white as the last resort
];
export const SELECTED_COLOR: HexColor = '#059669';
export const UNNAMED_COLOR: HexColor = '#ffffff';

function hash(key: string): number {
  let value = 2166136261;
  for (const char of key) {
    value ^= char.codePointAt(0) ?? 0;
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value;
}
/**
 * Objects of the checklist list take the palette in list order, so every object type in the
 * editor has its own color. Any other object gets a color from the rest of the palette by name.
 */
export function objectColor(
  objectId: string | null | undefined,
  objectName: string | undefined,
  rules: readonly { objectId: string }[] = [],
): HexColor {
  const distinct = OBJECT_PALETTE.length - 1;
  const index = objectId ? rules.findIndex((rule) => rule.objectId === objectId) : -1;
  if (index >= 0) return OBJECT_PALETTE[index % distinct] ?? UNNAMED_COLOR;
  const key = objectId ?? objectName?.trim().toLocaleLowerCase() ?? '';
  if (!key) return UNNAMED_COLOR;
  const free = Math.max(1, distinct - Math.min(rules.length, distinct));
  return OBJECT_PALETTE[Math.min(rules.length, distinct - 1) + (hash(key) % free)] ?? UNNAMED_COLOR;
}
