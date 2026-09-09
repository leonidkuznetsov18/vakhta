import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { ObjectStorageModule } from '../infra/object-storage.js';
import { MEDIA_OPTIONS, MediaService, type MediaOptions } from './media.service.js';

/**
 * Photos belong to no one section: a checklist has them and so does a report of a problem. The
 * service lives in its own module so both can import it without importing each other.
 */
@Module({
  imports: [ObjectStorageModule],
  providers: [
    MediaService,
    {
      provide: MEDIA_OPTIONS,
      useFactory: (config: ConfigService<Env, true>): MediaOptions => ({
        linkTtlSeconds: config.get('MEDIA_LINK_TTL_SECONDS', { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [MediaService],
})
export class MediaModule {}
