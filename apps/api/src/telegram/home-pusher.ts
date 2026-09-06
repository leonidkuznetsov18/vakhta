import type { Logger } from 'pino';
import type { ShiftChangedEvent } from '@vakhta/contracts';

/**
 * Sends the employee a fresh home screen after a shift change made outside the bot (a master in
 * the panel, a terminal, a timer). The bot redraws its own screen on every button press, so
 * changes it caused are skipped. Several changes of one employee within a short window are
 * coalesced into one message, because a master action often produces two or three transitions.
 */
export class HomeScreenPusher {
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly send: (employeeId: string) => Promise<void>,
    private readonly logger: Pick<Logger, 'warn'>,
    private readonly delayMs = 1500,
  ) {}

  onChange(event: ShiftChangedEvent): void {
    if (event.source === 'TELEGRAM') return;
    const existing = this.pending.get(event.employeeId);
    if (existing) clearTimeout(existing);
    this.pending.set(
      event.employeeId,
      setTimeout(() => void this.flush(event.employeeId), this.delayMs),
    );
  }

  /** Employees with a screen still waiting to be sent. */
  get waiting(): number {
    return this.pending.size;
  }

  stop(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
  }

  private async flush(employeeId: string): Promise<void> {
    this.pending.delete(employeeId);
    try {
      await this.send(employeeId);
    } catch (error) {
      // A missed refresh is not worth a retry: the next button press or /start redraws anyway.
      this.logger.warn({ err: error, employeeId }, 'telegram home screen push failed');
    }
  }
}
