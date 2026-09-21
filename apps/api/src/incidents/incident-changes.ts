import { Injectable } from '@nestjs/common';
import type { IncidentChangedEvent } from '@vakhta/contracts';
import { TenantChanges } from '../infra/tenant-changes.js';

/** Шина змін інцидентів для SSE екрана майстра (ТЗ 9.1 «Простои и инциденты»). */
@Injectable()
export class IncidentChanges extends TenantChanges<IncidentChangedEvent> {}
