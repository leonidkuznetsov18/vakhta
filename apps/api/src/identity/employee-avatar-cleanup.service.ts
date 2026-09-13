import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { and, asc, employees, eq, isNotNull, lte, mediaObjects, type Database } from '@vakhta/db';
import { DATABASE } from '../infra/database.module.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../infra/object-storage.js';

/** Expiry on each staged/retired media row is durable retry state, including process crashes. */
@Injectable()
export class EmployeeAvatarCleanupService implements OnModuleInit, OnApplicationShutdown {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private readonly logger = new Logger(EmployeeAvatarCleanupService.name);
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage | null,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = this.cleanupOnce()
        .then(
          () => undefined,
          () => {
            this.logger.warn('Employee avatar cleanup will retry');
          },
        )
        .finally(() => {
          this.running = null;
        });
    }, 60_000);
    this.timer.unref();
  }
  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  async cleanupOnce() {
    if (!this.storage?.delete) return;
    const storage = this.storage;
    const candidates = await this.db
      .select({ id: mediaObjects.id })
      .from(mediaObjects)
      .where(
        and(
          eq(mediaObjects.purpose, 'EMPLOYEE_AVATAR'),
          isNotNull(mediaObjects.storageKey),
          lte(mediaObjects.retentionUntil, new Date()),
        ),
      )
      .orderBy(asc(mediaObjects.retentionUntil))
      .limit(20);
    const failures: unknown[] = [];
    for (const candidate of candidates) {
      try {
        await this.db.transaction(async (tx) => {
          const [media] = await tx
            .select()
            .from(mediaObjects)
            .where(eq(mediaObjects.id, candidate.id))
            .for('update', { skipLocked: true });
          if (!media?.storageKey || !media.retentionUntil || media.retentionUntil > new Date())
            return;
          const [live] = await tx
            .select({ id: employees.id })
            .from(employees)
            .where(eq(employees.avatarMediaId, media.id))
            .limit(1);
          if (live) return;
          await storage.delete?.(media.storageKey);
          await tx
            .update(mediaObjects)
            .set({ storageKey: null, retentionUntil: null })
            .where(eq(mediaObjects.id, media.id));
        });
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(failures, 'Employee avatar cleanup failed; retained for retry');
  }
}
