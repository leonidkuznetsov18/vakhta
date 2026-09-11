import { admitSubmittedPhotoInspections } from './admission.js';
import { advanceCompletedPhotoReviews } from './review-stage.js';
import type { Database } from '@vakhta/db';
import type { InspectionAnalyzer } from './gemma.js';
import { dispatchInspectionTasks } from './tasks.js';

/** One in-flight call per worker, with expired-lease recovery owned by the shared task store. */
export class InspectionTaskRunner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  constructor(
    private readonly db: Database,
    private readonly analyzer: InspectionAnalyzer | null,
    private readonly failed: () => void,
  ) {}
  start(): void {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => this.poll(), 2000);
    this.timer.unref();
    this.poll();
  }
  private poll(): void {
    if (this.running || this.stopped) return;
    this.running = admitSubmittedPhotoInspections(this.db)
      .then(() => dispatchInspectionTasks(this.db, this.analyzer))
      .then(() => advanceCompletedPhotoReviews(this.db))
      .then(() => undefined)
      .catch(() => this.failed())
      .finally(() => {
        this.running = null;
      });
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }
}
