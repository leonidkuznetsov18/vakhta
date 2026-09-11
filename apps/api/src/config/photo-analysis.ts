import { z } from 'zod';

export const PHOTO_ANALYSIS_CONFIG = Symbol('PHOTO_ANALYSIS_CONFIG');

/** The sole defaults for both admission and the limits presented to users. */
export const PhotoAnalysisConfigSchema = z.object({
  PHOTO_INSPECTION_PER_PHOTO_LIMIT: z.coerce.number().int().positive().default(5),
  PHOTO_INSPECTION_GLOBAL_LIMIT: z.coerce.number().int().positive().default(1000),
  PHOTO_INSPECTION_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
});
export type PhotoAnalysisConfig = z.infer<typeof PhotoAnalysisConfigSchema>;
