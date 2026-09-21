import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FORMAT_VERSION = 1;

export interface EncryptedSecret {
  readonly ciphertext: Buffer;
  readonly keyVersion: number;
}

/**
 * Tenant secrets at rest: AES-256-GCM with the platform key. Layout of `ciphertext`:
 * format version (1 byte) · iv (12) · auth tag (16) · data. The key version is stored per row so a
 * rotated key can decrypt old rows during a rollover.
 */
export class SecretCipher {
  private readonly keys: ReadonlyMap<number, Buffer>;

  constructor(
    keyHex: string,
    readonly currentVersion = 1,
    previous: ReadonlyMap<number, string> = new Map(),
  ) {
    const keys = new Map<number, Buffer>();
    keys.set(currentVersion, parseKey(keyHex));
    for (const [version, hex] of previous) keys.set(version, parseKey(hex));
    this.keys = keys;
  }

  encrypt(plain: string): EncryptedSecret {
    const key = this.keys.get(this.currentVersion);
    if (!key) throw new Error('Secret key for the current version is missing');
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, tag, data]),
      keyVersion: this.currentVersion,
    };
  }

  decrypt(secret: EncryptedSecret): string {
    const key = this.keys.get(secret.keyVersion);
    if (!key) throw new Error(`Secret key version ${secret.keyVersion} is unknown`);
    const buffer = secret.ciphertext;
    if (buffer.length < 1 + IV_BYTES + TAG_BYTES || buffer[0] !== FORMAT_VERSION) {
      throw new Error('Secret ciphertext has an unknown format');
    }
    const iv = buffer.subarray(1, 1 + IV_BYTES);
    const tag = buffer.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const data = buffer.subarray(1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  /** Deterministic, keyed: equal plaintexts collide, nothing else leaks. */
  fingerprint(plain: string): string {
    const key = this.keys.get(this.currentVersion);
    if (!key) throw new Error('Secret key for the current version is missing');
    return createHmac('sha256', key).update(plain, 'utf8').digest('hex');
  }
}

function parseKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('CONTROL_ENCRYPTION_KEY must be 32 bytes as 64 hex characters');
  }
  return Buffer.from(hex, 'hex');
}

/** For .env generation and tests. */
export function generateSecretKeyHex(): string {
  return randomBytes(32).toString('hex');
}
