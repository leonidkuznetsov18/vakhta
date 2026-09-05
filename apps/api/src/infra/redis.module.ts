import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { RedisShortTermStore, SHORT_TERM_STORE } from './short-term-store.js';

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
      provide: SHORT_TERM_STORE,
      useFactory: (redis: Redis) => new RedisShortTermStore(redis),
      inject: [REDIS],
    },
    RedisShutdown,
  ],
  exports: [REDIS, SHORT_TERM_STORE],
})
export class RedisModule {}
