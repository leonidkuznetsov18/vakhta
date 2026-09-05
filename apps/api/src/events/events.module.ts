import { Global, Module } from '@nestjs/common';
import { AuditLog } from './audit-log.js';
import { EventStore } from './event-store.js';

@Global()
@Module({
  providers: [EventStore, AuditLog],
  exports: [EventStore, AuditLog],
})
export class EventsModule {}
