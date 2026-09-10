import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Api } from 'grammy';
import type { FileFetcher, MediaStore } from './process.js';

/** Завантаження файлу з Telegram: getFile → https://api.telegram.org/file/bot<token>/<path>. */
export class TelegramFileFetcher implements FileFetcher {
  private readonly api: Api;

  constructor(private readonly token: string) {
    this.api = new Api(token, { timeoutSeconds: 60 });
  }

  async fetch(
    fileId: string,
    signal?: AbortSignal,
  ): Promise<{ buffer: Buffer; contentType: string | null }> {
    signal?.throwIfAborted();
    // grammY's Node adapter has a polyfill AbortSignal type; its own timeout bounds getFile.
    // The outer preparation deadline prevents any later download after cancellation.
    const file = await this.api.getFile(fileId);
    signal?.throwIfAborted();
    if (!file.file_path) throw new Error('Telegram did not return a file path');
    const res = await fetch(`https://api.telegram.org/file/bot${this.token}/${file.file_path}`, {
      signal: signal ?? null,
    });
    if (!res.ok) throw new Error(`File download failed: HTTP ${res.status}`);
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

  async put(key: string, body: Buffer, contentType: string, signal?: AbortSignal): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
      signal ? { abortSignal: signal } : {},
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
