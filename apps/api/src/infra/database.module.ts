import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabase } from '@vakhta/db';
import type { Env } from '../config/env.js';

/** Токен для інʼєкції Drizzle-клієнта: `@Inject(DATABASE) private readonly db: Database`. */
export const DATABASE = Symbol('DATABASE');
const DATABASE_HANDLE = Symbol('DATABASE_HANDLE');

type Handle = ReturnType<typeof createDatabase>;

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_HANDLE) private readonly handle: Handle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.client.end({ timeout: 5 });
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_HANDLE,
      useFactory: (config: ConfigService<Env, true>) =>
        createDatabase(config.get('DATABASE_URL', { infer: true })),
      inject: [ConfigService],
    },
    { provide: DATABASE, useFactory: (handle: Handle) => handle.db, inject: [DATABASE_HANDLE] },
    DatabaseShutdown,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
