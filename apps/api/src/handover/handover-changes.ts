import { Injectable } from '@nestjs/common';
import type { HandoverChangedEvent } from '@vakhta/contracts';
import { TenantChanges } from '../infra/tenant-changes.js';

/** Шина змін передач для SSE панелі «Чистота и передача». */
@Injectable()
export class HandoverChanges extends TenantChanges<HandoverChangedEvent> {}
