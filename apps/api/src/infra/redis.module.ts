import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { SHORT_TERM_STORE, type ShortTermStore } from './short-term-store.js';
import { currentTenant, lateBound } from './tenant-context.js';

export const REDIS = Symbol('REDIS');

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: (config: ConfigService<Env, true>) =>
        new Redis(config.get('REDIS_URL', { infer: true }), {
          maxRetriesPerRequest: 2,
          lazyConnect: false,
        }),
      inject: [ConfigService],
    },
    {
      // Keys are namespaced per tenant by the runtime behind the current context.
      provide: SHORT_TERM_STORE,
      useFactory: (): ShortTermStore => lateBound(() => currentTenant().store),
    },
    RedisShutdown,
  ],
  exports: [REDIS, SHORT_TERM_STORE],
})
export class RedisModule {}
