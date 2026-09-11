import { PHOTO_OBJECT_PALETTE, type PhotoObjectView } from '@vakhta/contracts';

export type HexColor = `#${string}`;
export const SELECTED_COLOR: HexColor = '#059669';
export const UNNAMED_COLOR: HexColor = '#ffffff';

/** Anything that knows an object's color: a checklist rule or a catalog entry. */
export interface ColorSource {
  objectId: string;
  color?: string | undefined;
}
/** Rules first (they are the checklist's own list), then the rest of the catalog. */
export function colorSources(
  rules: readonly ColorSource[],
  objects: readonly PhotoObjectView[] = [],
): ColorSource[] {
  return [...rules, ...objects.map((object) => ({ objectId: object.id, color: object.color }))];
}

function hash(key: string): number {
  let value = 2166136261;
  for (const char of key) {
    value ^= char.codePointAt(0) ?? 0;
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value;
}
/**
 * The color belongs to the catalog object and is the same on every screen: chips, boxes and
 * badges read it from the rules or the catalog. A region whose object is unknown here (a name
 * typed before the catalog existed) gets a stable palette color by that name; an unnamed region
 * stays white.
 */
export function objectColor(
  objectId: string | null | undefined,
  objectName: string | undefined,
  sources: readonly ColorSource[] = [],
): HexColor {
  const known = objectId
    ? sources.find((source) => source.objectId === objectId)?.color
    : undefined;
  if (known) return known as HexColor;
  const key = objectId ?? objectName?.trim().toLocaleLowerCase() ?? '';
  if (!key) return UNNAMED_COLOR;
  return (PHOTO_OBJECT_PALETTE[hash(key) % PHOTO_OBJECT_PALETTE.length] ??
    UNNAMED_COLOR) as HexColor;
}
