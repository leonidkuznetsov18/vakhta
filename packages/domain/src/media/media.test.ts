import { describe, expect, it } from 'vitest';
import { assessQuality, findDuplicate, hammingDistance } from './quality.js';
import { PHASH_SIZE, phashFromGray } from './phash.js';

/** Гладкий 2D-візерунок з нетривіальними частотами; offset зсуває лише яскравість. */
function gradient(offset = 0): Uint8Array {
  const px = new Uint8Array(PHASH_SIZE * PHASH_SIZE);
  for (let y = 0; y < PHASH_SIZE; y += 1)
    for (let x = 0; x < PHASH_SIZE; x += 1) {
      const v =
        128 + 90 * Math.sin(x / 4.5) * Math.cos(y / 6.5) + 20 * Math.sin((x + y) / 3) + offset;
      px[y * PHASH_SIZE + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  return px;
}

function checker(): Uint8Array {
  const px = new Uint8Array(PHASH_SIZE * PHASH_SIZE);
  for (let y = 0; y < PHASH_SIZE; y += 1)
    for (let x = 0; x < PHASH_SIZE; x += 1)
      px[y * PHASH_SIZE + x] = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 230 : 20;
  return px;
}

describe('технічна перевірка фото (FR-PHO-03, T-25, T-26)', () => {
  it('оцінює роздільність, яскравість і пошкодження', () => {
    expect(assessQuality(null)).toBe('CORRUPT');
    expect(assessQuality({ width: 320, height: 240, brightness: 120, sizeBytes: 1000 })).toBe(
      'LOW_RES',
    );
    expect(assessQuality({ width: 1280, height: 960, brightness: 20, sizeBytes: 1000 })).toBe(
      'DARK',
    );
    expect(assessQuality({ width: 960, height: 1280, brightness: 120, sizeBytes: 1000 })).toBe(
      'OK',
    );
  });

  it('pHash стабільний, майже однакові зображення близькі, різні далекі', () => {
    const a = phashFromGray(gradient());
    expect(a).toHaveLength(16);
    expect(phashFromGray(gradient())).toBe(a);
    expect(hammingDistance(a, phashFromGray(gradient(3)))).toBeLessThanOrEqual(6);
    expect(hammingDistance(a, phashFromGray(checker()))).toBeGreaterThan(10);
    expect(() => phashFromGray(new Uint8Array(10))).toThrow();
  });

  it('точний повтор за SHA-256 і ймовірний за pHash', () => {
    const cur = { sha256: 'abc', phash: phashFromGray(gradient()) };
    expect(findDuplicate(cur, [{ id: 'x', sha256: 'abc', phash: null }])).toEqual({
      kind: 'EXACT',
      ofId: 'x',
    });
    const near = findDuplicate(cur, [
      { id: 'y', sha256: 'zzz', phash: phashFromGray(gradient(2)) },
    ]);
    expect(near.kind).toBe('NEAR');
    expect(
      findDuplicate(cur, [{ id: 'z', sha256: 'zzz', phash: phashFromGray(checker()) }]),
    ).toEqual({ kind: 'NONE' });
  });
});
