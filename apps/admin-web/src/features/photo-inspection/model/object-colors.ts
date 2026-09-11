/** Stable, distinguishable colors per object type so a rag is always one color and a cup another. */
export type HexColor = `#${string}`;
export const OBJECT_PALETTE: readonly HexColor[] = [
  '#ef4444',
  '#3b82f6',
  '#f59e0b',
  '#22c55e',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];
export const SELECTED_COLOR: HexColor = '#059669';
export const UNNAMED_COLOR: HexColor = '#ffffff';

/** The catalog id decides the color; a free-text object falls back to its name; nothing named is white. */
export function objectColor(objectId: string | null | undefined, objectName?: string): HexColor {
  const key = objectId ?? objectName?.trim().toLocaleLowerCase() ?? '';
  if (!key) return UNNAMED_COLOR;
  let hash = 2166136261;
  for (const char of key) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return OBJECT_PALETTE[hash % OBJECT_PALETTE.length] ?? UNNAMED_COLOR;
}
