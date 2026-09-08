import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { createLogger } from '../logger.js';
import { BonusMonthService } from './bonus-month.service.js';

/** Once an hour is enough: the close happens on one day of the month and is idempotent. */
const SCAN_MS = 60 * 60_000;

/**
 * The month-end driver (2026-09-08): asks the bonus month service to close the previous month at
 * every site. Nothing happens for most of the month; when the site's local calendar has moved past
 * the close day, the unit of the month is awarded and the cards go into the outbox. Repeats are
 * harmless — awards conflict on their unique index and cards on their dedupe key.
 */
@Injectable()
export class BonusMonthCloseService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    private readonly months: BonusMonthService,
    config: ConfigService<Env, true>,
  ) {
    this.logger = createLogger({
      LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
    });
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), SCAN_MS);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const outcomes = await this.months.closeDueMonths();
      for (const outcome of outcomes) {
        if (outcome.awarded > 0 || outcome.cards > 0)
          this.logger.info(outcome, 'bonus month closed');
      }
    } catch (err) {
      this.logger.error({ err }, 'bonus month close failed');
    } finally {
      this.busy = false;
    }
  }
}
