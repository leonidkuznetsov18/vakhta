import { z } from 'zod';
import { HandoverPhotoView } from './handover.js';
import { AiFeedbackRating } from './photo-inspection.js';

export const PhotoLibraryQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).default(''),
    status: z.enum(['UNREVIEWED', 'COMPLIANT', 'PROBLEMS', 'NOT_ASSESSABLE']).optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'End date must not precede start date',
  });
export type PhotoLibraryQuery = z.infer<typeof PhotoLibraryQuery>;
export const PhotoLibraryEntry = z.object({
  id: z.string().uuid(),
  handoverId: z.string().uuid(),
  photo: HandoverPhotoView,
  status: z.enum(['UNREVIEWED', 'COMPLIANT', 'PROBLEMS', 'NOT_ASSESSABLE']),
  /** Current reviewer feedback on the newest analysis run; absent feedback is not a negative vote. */
  aiFeedback: AiFeedbackRating.nullable().default(null),
  annotationCount: z.number().int().nonnegative(),
  remarks: z.array(z.string()),
  updatedAt: z.string().datetime().nullable(),
  businessDate: z.string().date(),
  zone: z.string().nullable(),
  employee: z.string(),
  archived: z.boolean(),
});
export type PhotoLibraryEntry = z.infer<typeof PhotoLibraryEntry>;
export const PhotoLibraryView = z.object({
  rows: z.array(PhotoLibraryEntry),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type PhotoLibraryView = z.infer<typeof PhotoLibraryView>;
