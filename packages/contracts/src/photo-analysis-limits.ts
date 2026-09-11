import { z } from 'zod';

const AnalysisUsage = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

export const PhotoAnalysisLimits = z.object({
  windowHours: z.number().int().positive(),
  perPhoto: AnalysisUsage,
  global: AnalysisUsage,
});
export type PhotoAnalysisLimits = z.infer<typeof PhotoAnalysisLimits>;
