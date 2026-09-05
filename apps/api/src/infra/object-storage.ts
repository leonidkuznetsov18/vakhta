import { Inject, Injectable, Module, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../config/env.js';

/** Порт видачі фото: лише короткоживучі підписані GET (FR-PHO-06). */
export interface ObjectStorage {
  presignGet(key: string, ttlSeconds: number): Promise<string>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  presignGet(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }
}

/** У тестах і без налаштованого S3: посилання виду memory://key. */
export class InMemoryObjectStorage implements ObjectStorage {
  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    return `memory://${key}?ttl=${ttlSeconds}`;
  }
}

@Injectable()
export class ObjectStorageFactory {
  constructor(
    @Optional() @Inject(ConfigService) private readonly config?: ConfigService<Env, true>,
  ) {}

  create(): ObjectStorage | null {
    const bucket = this.config?.get('S3_BUCKET', { infer: true });
    const accessKeyId = this.config?.get('S3_ACCESS_KEY', { infer: true });
    const secretAccessKey = this.config?.get('S3_SECRET_KEY', { infer: true });
    if (!bucket || !accessKeyId || !secretAccessKey) return null;
    const endpoint = this.config?.get('S3_ENDPOINT', { infer: true });
    const client = new S3Client({
      region: this.config?.get('S3_REGION', { infer: true }) ?? 'us-east-1',
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: this.config?.get('S3_FORCE_PATH_STYLE', { infer: true }) ?? true,
      credentials: { accessKeyId, secretAccessKey },
    });
    return new S3ObjectStorage(client, bucket);
  }
}

@Module({
  providers: [
    ObjectStorageFactory,
    {
      provide: OBJECT_STORAGE,
      useFactory: (factory: ObjectStorageFactory) => factory.create(),
      inject: [ObjectStorageFactory],
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class ObjectStorageModule {}
