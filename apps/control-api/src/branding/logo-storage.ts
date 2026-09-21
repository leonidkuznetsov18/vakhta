import { BrandingErrorCode } from '@vakhta/contracts';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ControlEnv } from '../config/env.js';
import { CONTROL_ENV } from '../infra/registry.module.js';
import { ControlError } from '../common/domain-error.js';

/** Public brand assets share the existing private bucket; only this service publishes logos. */
@Injectable()
export class LogoStorage implements OnApplicationShutdown {
  private readonly client: S3Client | null;
  constructor(@Inject(CONTROL_ENV) private readonly env: ControlEnv) {
    this.client =
      env.S3_ACCESS_KEY && env.S3_SECRET_KEY && env.S3_BUCKET
        ? new S3Client({
            region: env.S3_REGION,
            ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
            forcePathStyle: true,
            credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
          })
        : null;
  }
  async put(key: string, bytes: Uint8Array): Promise<void> {
    await this.requireClient().send(
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: 'image/webp',
      }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
  }
  async get(key: string): Promise<Uint8Array> {
    const result = await this.requireClient().send(
      new GetObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
      }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
    if (!result.Body) throw new ControlError('BRANDING_LOGO_UNAVAILABLE', 503, 'Logo unavailable');
    return result.Body.transformToByteArray();
  }
  onApplicationShutdown(): void {
    this.client?.destroy();
  }
  private requireClient(): S3Client {
    if (!this.client)
      throw new ControlError(
        BrandingErrorCode.STORAGE_UNAVAILABLE,
        503,
        'Logo storage unavailable',
      );
    return this.client;
  }
}
