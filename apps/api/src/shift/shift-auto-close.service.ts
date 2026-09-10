import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { createLogger } from '../logger.js';
import { ShiftService } from './shift.service.js';

/**
 * The end-of-day driver (2026-09-08): every AUTO_CLOSE_SCAN_MINUTES it asks the shift service to
 * close shifts left open past their planned end, so a shift always ends even when the employee
 * forgot to scan the exit QR. Runs on startup and periodically in the API process; the shared
 * employee mutex and transaction recheck keep multiple replicas and concurrent commands safe.
 */
@Injectable()
export class ShiftAutoCloseService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private readonly scanMs: number;

  constructor(
    private readonly shifts: ShiftService,
    config: ConfigService<Env, true>,
  ) {
    this.logger = createLogger({
      LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
    });
    this.scanMs = config.get('AUTO_CLOSE_SCAN_MINUTES', { infer: true }) * 60_000;
  }

  onModuleInit(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.scanMs);
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
      const closed = await this.shifts.autoCloseStale();
      if (closed > 0) this.logger.info({ closed }, 'auto-closed stale shifts');
    } catch (err) {
      this.logger.error({ err }, 'auto-close scan failed');
    } finally {
      this.busy = false;
    }
  }
}
