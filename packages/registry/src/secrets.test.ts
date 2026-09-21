import { describe, expect, it } from 'vitest';
import { SecretCipher, generateSecretKeyHex } from './secrets.js';

describe('SecretCipher', () => {
  const key = generateSecretKeyHex();

  it('round-trips a secret and stores nothing readable', () => {
    const cipher = new SecretCipher(key);
    const encrypted = cipher.encrypt('123456:bot-token');
    expect(encrypted.keyVersion).toBe(1);
    expect(encrypted.ciphertext.toString('utf8')).not.toContain('bot-token');
    expect(cipher.decrypt(encrypted)).toBe('123456:bot-token');
  });

  it('fails closed with a wrong key, a tampered payload or an unknown key version', () => {
    const cipher = new SecretCipher(key);
    const encrypted = cipher.encrypt('postgres://u:p@host/db');
    const other = new SecretCipher(generateSecretKeyHex());
    expect(() => other.decrypt(encrypted)).toThrow();
    const tampered = Buffer.from(encrypted.ciphertext);
    tampered[tampered.length - 1] = (tampered.at(-1) ?? 0) ^ 0xff;
    expect(() => cipher.decrypt({ ciphertext: tampered, keyVersion: 1 })).toThrow();
    expect(() => cipher.decrypt({ ...encrypted, keyVersion: 9 })).toThrow(/unknown/);
  });

  it('decrypts rows written by a previous key version during rotation', () => {
    const oldKey = generateSecretKeyHex();
    const oldCipher = new SecretCipher(oldKey, 1);
    const encrypted = oldCipher.encrypt('secret');
    const rotated = new SecretCipher(key, 2, new Map([[1, oldKey]]));
    expect(rotated.decrypt(encrypted)).toBe('secret');
    expect(rotated.encrypt('secret').keyVersion).toBe(2);
  });

  it('fingerprints are keyed and deterministic', () => {
    const cipher = new SecretCipher(key);
    expect(cipher.fingerprint('token')).toBe(cipher.fingerprint('token'));
    expect(cipher.fingerprint('token')).not.toBe(
      new SecretCipher(generateSecretKeyHex()).fingerprint('token'),
    );
  });

  it('rejects a malformed key', () => {
    expect(() => new SecretCipher('short')).toThrow(/64 hex/);
  });
});
