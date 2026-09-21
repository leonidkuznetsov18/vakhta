import { BrandingErrorCode } from '@vakhta/contracts';
import { TENANT_LOGO_MAX_BYTES } from '@vakhta/contracts';
import sharp from 'sharp';
import { ControlError } from '../common/domain-error.js';

const SIGNATURE = { RIFF: 'RIFF', WEBP: 'WEBP' } as const;
export async function normalizeLogo(encoded: string): Promise<Buffer> {
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > TENANT_LOGO_MAX_BYTES)
    throw new ControlError(BrandingErrorCode.LOGO_TOO_LARGE, 422, 'Logo exceeds 512 KB');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp =
    bytes.toString('ascii', 0, 4) === SIGNATURE.RIFF &&
    bytes.toString('ascii', 8, 12) === SIGNATURE.WEBP;
  if (!png && !jpeg && !webp)
    throw new ControlError(BrandingErrorCode.LOGO_INVALID, 422, 'Logo must be PNG, JPEG or WebP');
  try {
    return await sharp(bytes, { limitInputPixels: 16_000_000, animated: false })
      .rotate()
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    throw new ControlError(BrandingErrorCode.LOGO_INVALID, 422, 'Logo could not be decoded');
  }
}

export function logoUrl(baseUrl: string, tenantId: string, key: string | null): string | null {
  if (!key) return null;
  const version = /\/([a-f0-9]{64})\.webp$/.exec(key)?.[1];
  if (!version) return null;
  return new URL(`/public/tenant-logo/${tenantId}/${version}`, baseUrl).href;
}
