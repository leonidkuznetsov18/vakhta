import { z } from 'zod';
import { Uuid } from './common.js';

/** One catalog entry: a stable identity for an object type that masters mark on photos. */
export const PhotoObjectView = z.object({
  id: Uuid,
  name: z.string().trim().min(1).max(100),
  active: z.boolean(),
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
