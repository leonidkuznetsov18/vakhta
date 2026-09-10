export interface BonusBackgroundWork {
  recover(): Promise<void>;
  dispatch(): Promise<void>;
  failed(stage: 'RECOVERY' | 'DISPATCH'): void;
}

/** One bounded API batch at a time; shutdown stops admission and drains current database work. */
export class BonusTaskRunner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private nextRecoveryAt = 0;
  constructor(private readonly work: BonusBackgroundWork) {}
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
        await this.work.recover();
      } catch {
        this.work.failed('RECOVERY');
      }
    }
    if (this.stopped) return;
    try {
      await this.work.dispatch();
    } catch {
      this.work.failed('DISPATCH');
    }
  }
}
