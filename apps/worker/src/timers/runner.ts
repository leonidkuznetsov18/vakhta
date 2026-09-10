import type { Database } from '@vakhta/db';
import {
  recoverTimerTasks,
  type LegacyTimerReader,
  type TimerRecoveryOptions,
} from './recovery.js';
import { dispatchTimerTasks } from './tasks.js';

export interface TimerTaskObserver {
  dispatched(result: Awaited<ReturnType<typeof dispatchTimerTasks>>): void;
  recovered(result: Awaited<ReturnType<typeof recoverTimerTasks>>): void;
  failed(stage: 'RECOVERY' | 'DISPATCH'): void;
}

/** One bounded batch per process, immediate catch-up and shutdown that drains current DB work. */
export class TimerTaskRunner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private nextRecoveryAt = 0;

  constructor(
    private readonly db: Database,
    private readonly options: TimerRecoveryOptions,
    private readonly observer: TimerTaskObserver,
    private readonly legacy?: LegacyTimerReader,
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
        this.observer.recovered(await recoverTimerTasks(this.db, this.options, this.legacy));
      } catch {
        this.observer.failed('RECOVERY');
      }
    }
    if (this.stopped) return;
    try {
      this.observer.dispatched(
        await dispatchTimerTasks(this.db, {
          autoCloseGraceMinutes: this.options.autoCloseGraceMinutes,
        }),
      );
    } catch {
      this.observer.failed('DISPATCH');
    }
  }
}
