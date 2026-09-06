import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ACTIVATION_CODE_ALPHABET } from '../identity/activation.js';
import {
  PAIRING_CODE_LENGTH,
  formatPairingCode,
  generatePairingCode,
  hashPairingCode,
  isPairingCodeShape,
  normalizePairingCode,
  pairingCodeExpiresAt,
} from './pairing.js';

describe('terminal pairing codes', () => {
  it('generates codes of the fixed length from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generatePairingCode();
      expect(code).toHaveLength(PAIRING_CODE_LENGTH);
      expect([...code].every((ch) => ACTIVATION_CODE_ALPHABET.includes(ch))).toBe(true);
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it('hashes the same code identically regardless of case, spaces and dashes', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom(...ACTIVATION_CODE_ALPHABET), {
            minLength: PAIRING_CODE_LENGTH,
            maxLength: PAIRING_CODE_LENGTH,
          })
          .map((chars) => chars.join('')),
        (code) => {
          const typed = `${code.slice(0, 4).toLowerCase()} - ${code.slice(4)}`;
          expect(normalizePairingCode(typed)).toBe(code);
          expect(hashPairingCode(typed)).toBe(hashPairingCode(code));
          expect(hashPairingCode(code)).toMatch(/^[0-9a-f]{64}$/);
          expect(isPairingCodeShape(typed)).toBe(true);
        },
      ),
    );
  });

  it('rejects codes of the wrong length or with ambiguous characters', () => {
    expect(isPairingCodeShape('ABCD234')).toBe(false);
    expect(isPairingCodeShape('ABCD23456')).toBe(false);
    expect(isPairingCodeShape('ABCD2340')).toBe(false);
    expect(isPairingCodeShape('')).toBe(false);
  });

  it('formats as two groups and expires after the TTL', () => {
    expect(formatPairingCode('abcd2345')).toBe('ABCD-2345');
    const issued = new Date('2026-09-06T10:00:00Z');
    expect(pairingCodeExpiresAt(issued).toISOString()).toBe('2026-09-06T10:15:00.000Z');
    expect(pairingCodeExpiresAt(issued, 1).toISOString()).toBe('2026-09-06T10:01:00.000Z');
  });
});
