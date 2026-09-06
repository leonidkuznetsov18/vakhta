import {
  Controller,
  Get,
  Header,
  Inject,
  Injectable,
  Module,
  type OnModuleInit,
} from '@nestjs/common';
import {
  and,
  count,
  downtimeIncidents,
  eq,
  inArray,
  notificationOutbox,
  notInArray,
  shiftSessions,
  type Database,
} from '@vakhta/db';
import { OPEN_INCIDENT_STATUSES, TERMINAL_STATES } from '@vakhta/domain';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { DATABASE } from '../infra/database.module.js';

/**
 * Метрики Prometheus (ТЗ 12, NFR-01): тривалість запитів за маршрутом, стан аутбоксу,
 * відкриті зміни й інциденти. Без персональних даних у мітках.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();
  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Тривалість HTTP-запитів',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [this.registry],
  });
  readonly botUpdates = new Counter({
    name: 'vakhta_bot_updates_total',
    help: 'Оброблені оновлення Telegram',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });
  private readonly outboxPending = new Gauge({
    name: 'vakhta_outbox_pending',
    help: 'Рядки аутбоксу в PENDING',
    registers: [this.registry],
  });
  private readonly shiftsActive = new Gauge({
    name: 'vakhta_shifts_active',
    help: 'Незакриті зміни',
    registers: [this.registry],
  });
  private readonly incidentsOpen = new Gauge({
    name: 'vakhta_incidents_open',
    help: 'Відкриті інциденти',
    registers: [this.registry],
  });

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  observe(method: string, route: string, status: number, seconds: number): void {
    this.httpDuration.labels(method, route, String(status)).observe(seconds);
  }

  /** Стан із БД рахується при скрейпі: дешеві count-запити раз на інтервал Prometheus. */
  async render(): Promise<string> {
    const [[outbox], [shifts], [incidents]] = await Promise.all([
      this.db
        .select({ n: count() })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.status, 'PENDING')),
      this.db
        .select({ n: count() })
        .from(shiftSessions)
        .where(notInArray(shiftSessions.state, [...TERMINAL_STATES])),
      this.db
        .select({ n: count() })
        .from(downtimeIncidents)
        .where(and(inArray(downtimeIncidents.status, [...OPEN_INCIDENT_STATUSES]))),
    ]);
    this.outboxPending.set(outbox?.n ?? 0);
    this.shiftsActive.set(shifts?.n ?? 0);
    this.incidentsOpen.set(incidents?.n ?? 0);
    return this.registry.metrics();
  }
}

/** Ендпоінт без сесії: у продакшені закривається мережею (приватна адреса або allowlist). */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  render(): Promise<string> {
    return this.metrics.render();
  }
}

@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
