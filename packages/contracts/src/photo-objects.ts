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
