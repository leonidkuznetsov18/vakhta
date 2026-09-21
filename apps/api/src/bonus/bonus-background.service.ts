import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { recoverBonusTasks, sql, type Database } from '@vakhta/db';
import { DATABASE } from '../infra/database.module.js';
import { TenantRuntimeRegistry } from '../infra/tenant-runtime.js';
import { BonusService } from './bonus.service.js';
import { dispatchBonusTasks } from './bonus-task-dispatcher.js';
import { BonusTaskRunner } from './bonus-task-runner.js';

@Injectable()
export class BonusBackgroundService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BonusBackgroundService.name);
  private readonly runner: BonusTaskRunner;
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    scorer: BonusService,
    private readonly tenants: TenantRuntimeRegistry,
  ) {
    // Each tick visits every serving tenant; one tenant's failure never stops the others.
    this.runner = new BonusTaskRunner({
      recover: () =>
        this.tenants.forEachActive(
          async () => {
            const result = await this.db.transaction((tx) => recoverBonusTasks(tx));
            if (result.admitted || result.markers)
              this.logger.log({ message: 'Bonus recovery', ...result });
          },
          (_error, tenant) =>
            this.logger.error({ message: 'Bonus recovery failed', tenant: tenant.slug }),
        ),
      dispatch: () =>
        this.tenants.forEachActive(
          async () => {
            const result = await dispatchBonusTasks(this.db, scorer);
            if (result.claimed) this.logger.log({ message: 'Bonus dispatch', ...result });
          },
          (_error, tenant) =>
            this.logger.error({ message: 'Bonus dispatch failed', tenant: tenant.slug }),
        ),
      failed: (stage) =>
        this.logger.error({ message: 'Bonus background persistence failed', stage }),
    });
  }
  async onModuleInit(): Promise<void> {
    // Fail startup before using a schema that a tenant deployment has not migrated yet.
    await this.tenants.forEachActive(
      async () => {
        await this.db.execute(sql`SELECT month FROM bonus_month_guards LIMIT 0`);
      },
      (error) => {
        throw error;
      },
    );
    this.runner.start();
  }
  async onModuleDestroy(): Promise<void> {
    await this.runner.stop();
  }
}
