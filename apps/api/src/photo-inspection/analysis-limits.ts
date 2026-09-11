import { PhotoAnalysisLimits } from '@vakhta/contracts';
import { count, gte, photoInspectionRuns, sql, type DbOrTx } from '@vakhta/db';

import type { PhotoAnalysisConfig } from '../config/photo-analysis.js';

/** One database snapshot, including pending and failed runs, for display and admission. */
export async function loadAnalysisLimits(
  db: DbOrTx,
  inspectionId: string | null,
  config: PhotoAnalysisConfig,
  now = new Date(),
): Promise<PhotoAnalysisLimits> {
  const since = new Date(now.getTime() - config.PHOTO_INSPECTION_WINDOW_HOURS * 60 * 60 * 1000);
  const [usage] = await db
    .select({
      global: count(),
      perPhoto:
        sql<number>`count(*) filter (where ${photoInspectionRuns.inspectionId} = ${inspectionId})`.mapWith(
          Number,
        ),
    })
    .from(photoInspectionRuns)
    .where(gte(photoInspectionRuns.requestedAt, since));
  return PhotoAnalysisLimits.parse({
    windowHours: config.PHOTO_INSPECTION_WINDOW_HOURS,
    perPhoto: { used: usage?.perPhoto ?? 0, limit: config.PHOTO_INSPECTION_PER_PHOTO_LIMIT },
    global: { used: usage?.global ?? 0, limit: config.PHOTO_INSPECTION_GLOBAL_LIMIT },
  });
}

export function analysisLimitReached(limits: PhotoAnalysisLimits): boolean {
  return limits.perPhoto.used >= limits.perPhoto.limit || limits.global.used >= limits.global.limit;
}
