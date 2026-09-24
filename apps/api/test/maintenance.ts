import type { Database } from '@vakhta/db';
import { AuditLog } from '../src/events/audit-log.js';
import { EventStore } from '../src/events/event-store.js';
import type { ObjectStorage } from '../src/infra/object-storage.js';
import type { TimerScheduler } from '../src/infra/timers.queue.js';
import { DocumentsService } from '../src/maintenance/documents.service.js';
import { EmergencyService } from '../src/maintenance/emergency.service.js';
import { EquipmentService } from '../src/maintenance/equipment.service.js';
import { MaintenanceScheduler } from '../src/maintenance/maintenance-scheduler.js';
import { PlansService } from '../src/maintenance/plans.service.js';
import { WorkActionsService } from '../src/maintenance/work-actions.service.js';
import { WorkQueriesService } from '../src/maintenance/work-queries.service.js';
import { NotificationsService } from '../src/notifications/notifications.service.js';

/** The emergency repair service with real collaborators, for tests that build services by hand. */
export function emergencyService(db: Database, timers: TimerScheduler): EmergencyService {
  return maintenanceServices(db, { timers, storage: null }).emergency;
}

/** Every maintenance service wired as the Nest module wires them. */
export function maintenanceServices(
  db: Database,
  deps: { readonly timers: TimerScheduler; readonly storage: ObjectStorage | null },
) {
  const events = new EventStore();
  const audit = new AuditLog();
  const notifications = new NotificationsService();
  const scheduler = new MaintenanceScheduler(events, notifications, deps.timers);
  const actions = new WorkActionsService(db, events, audit, notifications, scheduler);
  const documents = new DocumentsService(db, audit, deps.storage);
  const plans = new PlansService(db, audit, events, scheduler);
  return {
    actions,
    documents,
    plans,
    equipment: new EquipmentService(db, audit, events, documents, plans),
    queries: new WorkQueriesService(db),
    emergency: new EmergencyService(db, events, notifications, actions, deps.timers),
  };
}

/** Object storage in memory, enough for upload, link and Telegram send. */
export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, Uint8Array>();

  presignGet(key: string, ttlSeconds: number): Promise<string> {
    return Promise.resolve(`memory://${key}?ttl=${ttlSeconds}`);
  }

  put(key: string, body: Uint8Array): Promise<void> {
    this.objects.set(key, body);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  get(key: string): Promise<Uint8Array> {
    const body = this.objects.get(key);
    if (!body) return Promise.reject(new Error(`No object ${key}`));
    return Promise.resolve(body);
  }
}
