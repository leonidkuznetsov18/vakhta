import type { Logger } from 'pino';
import type { ShiftChangedEvent } from '@vakhta/contracts';
import type { TenantChange } from '../infra/tenant-changes.js';

export interface HomeScreenTarget {
  readonly tenantId: string;
  readonly employeeId: string;
}

/**
 * Sends the employee a fresh home screen after a shift change made outside the bot (a master in
 * the panel, a terminal, a timer). The bot redraws its own screen on every button press, so
 * changes it caused are skipped. Several changes of one employee within a short window are
 * coalesced into one message, because a master action often produces two or three transitions.
 */
export class HomeScreenPusher {
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly send: (target: HomeScreenTarget) => Promise<void>,
    private readonly logger: Pick<Logger, 'warn'>,
    private readonly delayMs = 1500,
  ) {}

  onChange(change: TenantChange<ShiftChangedEvent>): void {
    if (change.event.source === 'TELEGRAM' || !change.tenantId) return;
    const target = { tenantId: change.tenantId, employeeId: change.event.employeeId };
    const key = `${target.tenantId}:${target.employeeId}`;
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing);
    this.pending.set(
      key,
      setTimeout(() => void this.flush(key, target), this.delayMs),
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

  private async flush(key: string, target: HomeScreenTarget): Promise<void> {
    this.pending.delete(key);
    try {
      await this.send(target);
    } catch (error) {
      // A missed refresh is not worth a retry: the next button press or /start redraws anyway.
      this.logger.warn(
        { err: error, employeeId: target.employeeId },
        'telegram home screen push failed',
      );
    }
  }
}
