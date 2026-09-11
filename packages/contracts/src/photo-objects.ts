import { z } from 'zod';
import { Uuid } from './common.js';

/** Lower-case hex color, the form stored in the catalog. */
export const PhotoObjectColor = z.string().regex(/^#[0-9a-f]{6}$/u);
export type PhotoObjectColor = z.infer<typeof PhotoObjectColor>;
/**
 * Vivid, clearly different hues in an order where neighbours never look alike. A new catalog
 * object takes the least used color, so the first objects are all distinct and later ones reuse
 * hues as evenly as possible. The color belongs to the object and is the same on every screen.
 */
export const PHOTO_OBJECT_PALETTE: readonly PhotoObjectColor[] = [
  '#ff2d55', // red
  '#0a84ff', // blue
  '#ffd60a', // yellow
  '#30d158', // green
  '#bf5af2', // purple
  '#ff9f0a', // orange
  '#64d2ff', // cyan
  '#ff375f', // pink
  '#a3e635', // lime
  '#f472b6', // rose
  '#2dd4bf', // teal
  '#fb923c', // tangerine
];
export function nextPhotoObjectColor(used: readonly string[]): PhotoObjectColor {
  const counts = PHOTO_OBJECT_PALETTE.map((color) => used.filter((item) => item === color).length);
  const least = Math.min(...counts);
  return PHOTO_OBJECT_PALETTE[counts.indexOf(least)] ?? PHOTO_OBJECT_PALETTE[0]!;
}
/** One catalog entry: a stable identity for an object type that masters mark on photos. */
export const PhotoObjectView = z.object({
  id: Uuid,
  name: z.string().trim().min(1).max(100),
  active: z.boolean(),
  color: PhotoObjectColor,
});
export type PhotoObjectView = z.infer<typeof PhotoObjectView>;
export const PhotoObjectsView = z.object({
  objects: z.array(PhotoObjectView),
  canEdit: z.boolean(),
});
export type PhotoObjectsView = z.infer<typeof PhotoObjectsView>;
export const CreatePhotoObject = z.object({ name: z.string().trim().min(1).max(100) });
export type CreatePhotoObject = z.infer<typeof CreatePhotoObject>;

/**
 * Two spellings of one object type collapse to one catalog entry: case, surrounding spaces and a
 * final vowel are ignored, so "Ганчірка" and "Ганчірки" or "Стаканчик" and "Стаканчики" are the
 * same key. The database enforces the same rule; keep both expressions identical.
 */
export function photoObjectKey(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase()
    .replace(/[аяиіыуюеє]$/u, '');
}
