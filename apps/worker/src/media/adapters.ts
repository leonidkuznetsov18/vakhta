import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Api } from 'grammy';
import type { FileFetcher, MediaStore } from './process.js';

/** Завантаження файлу з Telegram: getFile → https://api.telegram.org/file/bot<token>/<path>. */
export class TelegramFileFetcher implements FileFetcher {
  private readonly api: Api;

  constructor(private readonly token: string) {
    this.api = new Api(token);
  }

  async fetch(fileId: string): Promise<{ buffer: Buffer; contentType: string | null }> {
    const file = await this.api.getFile(fileId);
    if (!file.file_path) throw new Error('Telegram не повернув file_path');
    const res = await fetch(`https://api.telegram.org/file/bot${this.token}/${file.file_path}`);
    if (!res.ok) throw new Error(`завантаження файлу: HTTP ${res.status}`);
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type'),
    };
  }
}

export class S3MediaStore implements MediaStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  static fromEnv(env: {
    S3_ENDPOINT?: string | undefined;
    S3_REGION: string;
    S3_BUCKET?: string | undefined;
    S3_ACCESS_KEY?: string | undefined;
    S3_SECRET_KEY?: string | undefined;
    S3_FORCE_PATH_STYLE: boolean;
  }): S3MediaStore | null {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) return null;
    const client = new S3Client({
      region: env.S3_REGION,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
    return new S3MediaStore(client, env.S3_BUCKET);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }
}

/** У тестах: памʼять замість S3. */
export class InMemoryMediaStore implements MediaStore {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }
}
