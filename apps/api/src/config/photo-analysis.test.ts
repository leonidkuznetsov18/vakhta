import { describe, expect, it } from 'vitest';
import { PhotoAnalysisConfigSchema } from './photo-analysis.js';

describe('photo analysis configuration', () => {
  it('uses the owner-selected defaults and accepts environment overrides', () => {
    expect(PhotoAnalysisConfigSchema.parse({})).toEqual({
      PHOTO_INSPECTION_PER_PHOTO_LIMIT: 5,
      PHOTO_INSPECTION_GLOBAL_LIMIT: 1000,
      PHOTO_INSPECTION_WINDOW_HOURS: 24,
    });
    expect(
      PhotoAnalysisConfigSchema.parse({
        PHOTO_INSPECTION_PER_PHOTO_LIMIT: '7',
        PHOTO_INSPECTION_GLOBAL_LIMIT: '37',
        PHOTO_INSPECTION_WINDOW_HOURS: '8',
      }),
    ).toEqual({
      PHOTO_INSPECTION_PER_PHOTO_LIMIT: 7,
      PHOTO_INSPECTION_GLOBAL_LIMIT: 37,
      PHOTO_INSPECTION_WINDOW_HOURS: 8,
    });
  });
  it.each(['0', '-1', '1.5', 'invalid'])('rejects invalid limits: %s', (value) => {
    expect(
      PhotoAnalysisConfigSchema.safeParse({ PHOTO_INSPECTION_GLOBAL_LIMIT: value }).success,
    ).toBe(false);
    expect(
      PhotoAnalysisConfigSchema.safeParse({ PHOTO_INSPECTION_PER_PHOTO_LIMIT: value }).success,
    ).toBe(false);
  });
});
