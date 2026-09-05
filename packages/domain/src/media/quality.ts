/** Технічна перевірка фото (FR-PHO-03): підозра переводить на ручну перевірку, не карає. */
export const MEDIA_QUALITY_STATUSES = [
  'PENDING',
  'OK',
  'LOW_RES',
  'DARK',
  'CORRUPT',
  'DUPLICATE_SUSPECT',
  'MANUAL_REVIEW',
] as const;
export type MediaQualityStatus = (typeof MEDIA_QUALITY_STATUSES)[number];

export interface MediaMetrics {
  readonly width: number;
  readonly height: number;
  /** Середня яскравість 0..255 у градаціях сірого. */
  readonly brightness: number;
  readonly sizeBytes: number;
}

export interface QualityThresholds {
  readonly minWidth: number;
  readonly minHeight: number;
  readonly minBrightness: number;
  /** Відстань Гемінга pHash, до якої фото вважається ймовірним повтором. */
  readonly nearDuplicateDistance: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = Object.freeze({
  minWidth: 640,
  minHeight: 480,
  minBrightness: 40,
  nearDuplicateDistance: 6,
});

export function assessQuality(
  metrics: MediaMetrics | null,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): Exclude<MediaQualityStatus, 'PENDING' | 'DUPLICATE_SUSPECT' | 'MANUAL_REVIEW'> {
  if (!metrics || metrics.sizeBytes <= 0 || metrics.width <= 0 || metrics.height <= 0)
    return 'CORRUPT';
  const shortSide = Math.min(metrics.width, metrics.height);
  const longSide = Math.max(metrics.width, metrics.height);
  if (
    shortSide < Math.min(thresholds.minWidth, thresholds.minHeight) ||
    longSide < Math.max(thresholds.minWidth, thresholds.minHeight)
  ) {
    return 'LOW_RES';
  }
  if (metrics.brightness < thresholds.minBrightness) return 'DARK';
  return 'OK';
}

/** Відстань Гемінга між двома hex-рядками pHash однакової довжини. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

export interface DuplicateCandidateMedia {
  readonly id: string;
  readonly sha256: string | null;
  readonly phash: string | null;
}

export type DuplicateVerdict =
  | { readonly kind: 'NONE' }
  | { readonly kind: 'EXACT'; readonly ofId: string }
  | { readonly kind: 'NEAR'; readonly ofId: string; readonly distance: number };

/** Точний повтор за SHA-256, ймовірний за pHash (T-26). */
export function findDuplicate(
  current: { readonly sha256: string; readonly phash: string },
  others: readonly DuplicateCandidateMedia[],
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): DuplicateVerdict {
  const exact = others.find((o) => o.sha256 === current.sha256);
  if (exact) return { kind: 'EXACT', ofId: exact.id };
  let best: { id: string; distance: number } | null = null;
  for (const o of others) {
    if (!o.phash) continue;
    const distance = hammingDistance(current.phash, o.phash);
    if (distance <= thresholds.nearDuplicateDistance && (!best || distance < best.distance)) {
      best = { id: o.id, distance };
    }
  }
  return best ? { kind: 'NEAR', ofId: best.id, distance: best.distance } : { kind: 'NONE' };
}
