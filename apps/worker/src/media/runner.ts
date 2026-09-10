import type { Database } from '@vakhta/db';
import type { MediaDependencies } from './process.js';
import { dispatchMediaTasks, recoverMediaTasks } from './tasks.js';

export interface MediaTaskObserver {
  completed(result: {
    readonly claimed: number;
    readonly completed: number;
    readonly retried: number;
    readonly lost: number;
  }): void;
  recovered(result: {
    readonly admitted: number;
    readonly bonusQueued: number;
    readonly inconsistent: number;
  }): void;
  failed(stage: 'RECOVERY' | 'DISPATCH'): void;
}

/** One bounded in-flight batch per process; PostgreSQL coordinates independent processes. */
export class MediaTaskRunner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private nextRecoveryAt = 0;
  private stopped = false;

  constructor(
    private readonly db: Database,
    private readonly deps: MediaDependencies | null,
    private readonly observer: MediaTaskObserver,
  ) {}

  start(): void {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => this.poll(), 1000);
    this.timer.unref();
    this.poll();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  private poll(): void {
    if (this.stopped || this.running) return;
    this.running = this.tick().finally(() => {
      this.running = null;
    });
  }

  private async tick(): Promise<void> {
    if (Date.now() >= this.nextRecoveryAt) {
      this.nextRecoveryAt = Date.now() + 60_000;
      try {
        this.observer.recovered(await recoverMediaTasks(this.db));
      } catch {
        // Recovery failure does not prevent already admitted tasks from being dispatched.
        this.observer.failed('RECOVERY');
      }
    }
    try {
      this.observer.completed(await dispatchMediaTasks(this.db, this.deps));
    } catch {
      // Never log a database query or dependency exception containing private payload data.
      this.observer.failed('DISPATCH');
    }
  }
}
