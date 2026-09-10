import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { recoverBonusTasks, sql, type Database } from '@vakhta/db';
import { DATABASE } from '../infra/database.module.js';
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
  ) {
    this.runner = new BonusTaskRunner({
      recover: async () => {
        const result = await this.db.transaction((tx) => recoverBonusTasks(tx));
        if (result.admitted || result.markers)
          this.logger.log({ message: 'Bonus recovery', ...result });
      },
      dispatch: async () => {
        const result = await dispatchBonusTasks(this.db, scorer);
        if (result.claimed) this.logger.log({ message: 'Bonus dispatch', ...result });
      },
      failed: (stage) =>
        this.logger.error({ message: 'Bonus background persistence failed', stage }),
    });
  }
  async onModuleInit(): Promise<void> {
    // Fail startup before using a schema that the deployment has not migrated yet.
    await this.db.execute(sql`SELECT month FROM bonus_month_guards LIMIT 0`);
    this.runner.start();
  }
  async onModuleDestroy(): Promise<void> {
    await this.runner.stop();
  }
}
